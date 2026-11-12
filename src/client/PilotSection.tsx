/**
 * dsh-model-pilot settings page. Self-contained: fetches the host routes via
 * same-origin HTTP and keeps its own React state. Registered into the official
 * settings panel through the `settings.section` slot (no DOM injection).
 */
import React, { useCallback, useEffect, useState } from "react";
import { api, type StateResponse, type ProviderView, type ModelView, type MatchInfoView } from "./api.js";
import { t } from "./i18n.js";
import { styles } from "./styles.js";
import { ModelTable } from "./ModelTable.js";
import { OverrideForm } from "./OverrideForm.js";
import { Modal } from "./Modal.js";

/** Short, human label for a capability source (shown as a model badge). */
const PROTOCOLS = ["openai-completions", "openai-responses", "anthropic-messages", "gemini"];

export function PilotSection(_props: { close?: () => void }): React.ReactElement {
  const [state, setState] = useState<StateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [editRoute, setEditRoute] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{ route: string; model: ModelView } | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.state());
    } catch (error) {
      setToast({ msg: String(error instanceof Error ? error.message : error), err: true });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    setToast(null);
    try {
      const result = await fn();
      setToast({ msg: typeof result === "string" ? result : okMsg });
      await load();
    } catch (error) {
      setToast({ msg: String(error instanceof Error ? error.message : error), err: true });
    } finally {
      setBusy(false);
    }
  }, [load]);

  const providers = state?.providers ?? {};
  const routeIds = Object.keys(providers);

  return (
    <div style={styles.page}>
      <div style={styles.h1}>{t("title")}</div>
      <div style={styles.sub}>{t("subtitle")}</div>

      {state?.catalog && (
        <div style={styles.muted}>
          {t("catalog")}: {state.catalog.models} models · {state.catalog.providers} providers
          {state.catalog.generatedAt ? ` · ${new Date(state.catalog.generatedAt).toISOString().slice(0, 10)}` : ""}
        </div>
      )}
      {state && !state.catalog && <div style={styles.muted}>{t("catalog")}: unavailable ({state.catalogError ?? "fallback"})</div>}
      {state?.modelsDev && (
        <div style={styles.muted}>
          models.dev: {state.modelsDev.ok ? `${state.modelsDev.source}${state.modelsDev.fetchedAt ? ` · ${new Date(state.modelsDev.fetchedAt).toISOString().slice(0, 10)}` : ""}` : "unavailable"}
          {" · "}{t("protocol")}: {(state.supportedProtocols ?? []).join(", ")}
        </div>
      )}

      {toast && <div style={toast.err ? styles.toastErr : styles.toast}>{toast.msg}</div>}

      <div style={styles.spread}>
        <div style={{ ...styles.section, margin: 0 }}>{t("providers")}</div>
        <div style={styles.row}>
          <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh(), t("ok"))}>{t("refreshAll")}</button>
          <button style={styles.btnPrimary} disabled={busy} onClick={() => { setEditRoute(null); setAddOpen(true); }}>{t("addProvider")}</button>
        </div>
      </div>

      {routeIds.length === 0 && <div style={styles.muted}>{t("noProviders")}</div>}

      {routeIds.map((id) => {
        const p = providers[id];
        const isOpen = expanded[id];
        // Mirror routes (protocol shards "<parent>-<protocol>") render as an
        // indented sub-card of their parent, not as an independent provider.
        const shardMatch = /^(.+)-((?:anthropic-messages|openai-completions|openai-responses|gemini))$/.exec(id);
        const parentId = shardMatch?.[1];
        if (parentId && providers[parentId]) return null; // drawn under the parent
        const shards = shardMatch ? [] : routeIds.filter((r) => r.startsWith(id + "-") && /^(?:anthropic-messages|openai-completions|openai-responses|gemini)$/.test(r.slice(id.length + 1)));
        const moves = state?.moves ?? {};
        const movedOut: Record<string, { to: string; protocol: string }> = {};
        for (const [k, v] of Object.entries(moves)) {
          if (k.startsWith(id + "/")) movedOut[k.slice(id.length + 1)] = v;
        }
        return (
          <div key={id} style={{ ...styles.card, marginLeft: parentId ? 18 : 0 }}>
            <div style={styles.spread}>
              <div>
                <strong>{p.displayName || id}</strong> <span style={styles.muted}>({id})</span>
                {shards.length > 0 && <span style={{ ...styles.badge, ...styles.badgeWarn, marginLeft: 6 }}>{t("shard")} ×{shards.length}</span>}
                <div style={styles.muted}>{p.baseURL} · {p.api} · {p.keyConfigured ? t("keyConfigured") : t("keyMissing")} · {p.modelCount} {t("models")}</div>
              </div>
              <div style={styles.row}>
                <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh([id]), t("ok"))}>{t("refresh")}</button>
                <button style={styles.btn} disabled={busy} title={t("probeHint")} onClick={async () => { setBusy(true); try { const r = await api.probe(id); setToast({ msg: `${r.protocol}: ${r.reachable ? t("reachable") : t("unreachable")}${r.status ? ` (HTTP ${r.status})` : ""}${r.error ? ` — ${r.error}` : ""}`, err: !r.reachable }); } catch (e) { setToast({ msg: String(e instanceof Error ? e.message : e), err: true }); } finally { setBusy(false); } }}>{t("probe")}</button>
                <button style={styles.btn} disabled={busy} onClick={() => { setEditRoute(id); setAddOpen(true); }}>{t("override")}</button>
                <button style={styles.btn} onClick={() => setExpanded((e) => ({ ...e, [id]: !e[id] }))}>{isOpen ? "▾" : "▸"} {t("models")}</button>
                <button style={styles.btnDanger} disabled={busy} onClick={() => run(() => api.removeProvider(id), t("ok"))}>{t("remove")}</button>
              </div>
            </div>

            {isOpen && (
              <ModelTable
                models={p.models ?? []}
                matchinfo={state?.matchinfo?.[id]}
                overridden={new Set(Object.keys(state?.overrides ?? {}).filter((k) => k.startsWith(id + "/")).map((k) => k.slice(id.length + 1)))}
                onOverride={(m) => setOverrideTarget({ route: id, model: m })}
                onMove={state?.supportedProtocols?.length ? (m, protocol) => run(async () => {
                  const r = await api.override(id, m.id, {}, false, protocol);
                  setOverrideTarget(null);
                  return t("movedMsg").replace("{model}", m.id).replace("{to}", r.to ?? "").replace("{count}", String(r.mirrorModels ?? 0));
                }, t("ok")) : undefined}
                protocols={state?.supportedProtocols ?? PROTOCOLS}
                routeProtocol={p.api}
                movedOut={movedOut}
              />
            )}

            {isOpen && shards.map((sid) => {
              const sp = providers[sid];
              const sMoves = state?.moves ?? {};
              const sMovedOut: Record<string, { to: string; protocol: string }> = {};
              for (const [k, v] of Object.entries(sMoves)) {
                if (k.startsWith(sid + "/")) sMovedOut[k.slice(sid.length + 1)] = v;
              }
              return (
                <div key={sid} style={{ ...styles.card, margin: "6px 0 0 18px", padding: "10px 12px" }}>
                  <div style={styles.spread}>
                    <div style={styles.muted}>{t("shard")}: {sp.api} · {sp.modelCount} {t("models")}</div>
                    <div style={styles.row}>
                      <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh([sid]), t("ok"))}>{t("refresh")}</button>
                      <button style={styles.btn} onClick={() => setExpanded((e) => ({ ...e, [sid]: !e[sid] }))}>{expanded[sid] ? "▾" : "▸"} {t("models")}</button>
                    </div>
                  </div>
                  {expanded[sid] && (
                    <ModelTable
                      models={sp.models ?? []}
                      matchinfo={state?.matchinfo?.[sid]}
                      overridden={new Set(Object.keys(state?.overrides ?? {}).filter((k) => k.startsWith(sid + "/")).map((k) => k.slice(sid.length + 1)))}
                      onOverride={(m) => setOverrideTarget({ route: sid, model: m })}
                      onMove={state?.supportedProtocols?.length ? (m, protocol) => run(async () => {
                        const r = await api.override(sid, m.id, {}, false, protocol);
                        return t("movedMsg").replace("{model}", m.id).replace("{to}", r.to ?? "").replace("{count}", String(r.mirrorModels ?? 0));
                      }, t("ok")) : undefined}
                      protocols={state?.supportedProtocols ?? PROTOCOLS}
                      routeProtocol={sp.api}
                      movedOut={sMovedOut}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <OptionsPanel state={state} busy={busy} run={run} />
      <BackupsPanel state={state} busy={busy} run={run} />

      {addOpen && (
        <ProviderForm
          initial={editRoute ? { id: editRoute, ...providers[editRoute] } : undefined}
          protocols={state?.supportedProtocols ?? PROTOCOLS}
          onClose={() => setAddOpen(false)}
          onSubmit={(form) => run(async () => {
            const r = await api.upsertProvider(form);
            setAddOpen(false);
            const proto = r.detectedProtocol ?? r.route?.api ?? form.api ?? "";
            return t("addedMsg").replace("{protocol}", proto).replace("{count}", String(r.modelCount ?? 0));
          }, t("ok"))}
          busy={busy}
        />
      )}

      {overrideTarget && (
        <OverrideForm
          route={overrideTarget.route}
          model={overrideTarget.model}
          onClose={() => setOverrideTarget(null)}
          onSubmit={(cap, clear) => run(async () => { await api.override(overrideTarget.route, overrideTarget.model.id, cap, clear); setOverrideTarget(null); }, t("ok"))}
          busy={busy}
        />
      )}
    </div>
  );
}

function OptionsPanel({ state, busy, run }: { state: StateResponse | null; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const o = state?.options ?? {};
  const [local, setLocal] = useState<Record<string, unknown>>({});
  useEffect(() => { setLocal(o); }, [state]);
  const set = (k: string, v: unknown) => setLocal((s) => ({ ...s, [k]: v }));
  return (
    <div>
      <div style={styles.section}>{t("options")}</div>
      <div style={styles.card}>
        <div style={styles.row}>
          <label style={styles.field}>
            <span style={styles.label}>{t("deleteSync")}</span>
            <input type="checkbox" checked={Boolean(local.deleteSync)} onChange={(e) => set("deleteSync", e.target.checked)} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>{t("autoRefresh")}</span>
            <input type="checkbox" checked={Boolean(local.autoRefresh)} onChange={(e) => set("autoRefresh", e.target.checked)} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>{t("refreshIntervalHours")}</span>
            <input style={styles.input} type="number" min={1} value={Number(local.refreshIntervalHours ?? 24)} onChange={(e) => set("refreshIntervalHours", Number(e.target.value))} />
          </label>
          <label style={styles.field}>
            <span style={styles.label}>{t("backupKeep")}</span>
            <input style={styles.input} type="number" min={1} value={Number(local.backupKeep ?? 10)} onChange={(e) => set("backupKeep", Number(e.target.value))} />
          </label>
        </div>
        <label style={{ ...styles.field, marginTop: 8 }}>
          <span style={styles.label}>{t("autoProtocolSplit")}</span>
          <input type="checkbox" checked={local.autoProtocolSplit !== false} onChange={(e) => set("autoProtocolSplit", e.target.checked)} />
          <div style={styles.muted}>{t("autoProtocolSplitHint")}</div>
        </label>
        <button style={styles.btnPrimary} disabled={busy} onClick={() => run(() => api.options(local), t("ok"))}>{t("save")}</button>
      </div>
    </div>
  );
}

function BackupsPanel({ state, busy, run }: { state: StateResponse | null; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const backups = state?.backups ?? [];
  return (
    <div>
      <div style={styles.section}>{t("backups")}</div>
      <div style={styles.card}>
        {backups.length === 0 && <div style={styles.muted}>—</div>}
        {backups.map((b) => (
          <div key={b.id} style={{ ...styles.spread, padding: "5px 0" }}>
            <div style={styles.muted}>{new Date(b.createdAt).toLocaleString()} · {b.reason} · {b.routes} routes</div>
            <button style={styles.btn} disabled={busy} onClick={() => run(() => api.rollback(b.id), t("ok"))}>{t("rollback")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProviderForm({ initial, protocols, onClose, onSubmit, busy }: {
  initial?: { id: string } & Partial<ProviderView>;
  protocols: string[];
  onClose: () => void;
  onSubmit: (form: { id: string; displayName?: string; baseURL?: string; api?: string; apiKey?: string }) => void;
  busy: boolean;
}) {
  const [id, setId] = useState(initial?.id ?? "");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [baseURL, setBaseURL] = useState(initial?.baseURL ?? "");
  const [apiProto, setApiProto] = useState(initial?.api ?? "auto");
  const [apiKey, setApiKey] = useState("");
  const editing = Boolean(initial?.id);
  return (
    <Modal title={editing ? t("override") : t("addProvider")} onClose={onClose}>
        <label style={styles.field}>
          <span style={styles.label}>{t("routeId")}</span>
          <input style={styles.input} value={id} disabled={editing} onChange={(e) => setId(e.target.value)} placeholder="completions" />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("displayName")}</span>
          <input style={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("baseURL")}</span>
          <input style={styles.input} value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://gateway.example/v1" />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("protocol")}</span>
          <select style={styles.input} value={apiProto} onChange={(e) => setApiProto(e.target.value)}>
            <option value="auto">{t("autoProtocol")}</option>
            {protocols.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={styles.muted}>{t("autoHint")}</div>
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("apiKey")} {editing ? "(leave blank to keep)" : ""}</span>
          <input style={styles.input} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </label>
        <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 12 }}>
          <button style={styles.btn} onClick={onClose}>{t("cancel")}</button>
          <button style={styles.btnPrimary} disabled={busy || !id || !baseURL} onClick={() => onSubmit({ id, displayName, baseURL, api: apiProto, apiKey: apiKey || undefined })}>{t("save")}</button>
        </div>
    </Modal>
  );
}
