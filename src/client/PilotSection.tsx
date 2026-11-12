/**
 * dsh-model-pilot settings page. Self-contained: fetches the host routes via
 * same-origin HTTP and keeps its own React state. Registered into the official
 * settings panel through the `settings.section` slot (no DOM injection).
 */
import React, { useCallback, useEffect, useState } from "react";
import { api, type StateResponse, type ProviderView, type ModelView } from "./api.js";
import { t } from "./i18n.js";

const PROTOCOLS = ["openai-completions", "openai-responses", "anthropic-messages", "gemini"];

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, color: "var(--dsw-alias-label-primary, #1a1a1a)", fontFamily: "inherit", padding: "4px 2px 40px" },
  h1: { fontSize: 20, fontWeight: 650, margin: "0 0 2px" },
  sub: { fontSize: 13, opacity: 0.7, margin: "0 0 18px" },
  section: { margin: "22px 0 8px", fontSize: 15, fontWeight: 600 },
  card: { border: "1px solid var(--dsw-alias-border, #e2e2e2)", borderRadius: 10, padding: 14, marginBottom: 12, background: "var(--dsw-alias-bg-subtle, #fafafa)" },
  row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  spread: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  btn: { border: "1px solid var(--dsw-alias-border, #ccc)", borderRadius: 7, padding: "5px 12px", fontSize: 13, cursor: "pointer", background: "var(--dsw-alias-bg, #fff)", color: "inherit" },
  btnPrimary: { border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 13, cursor: "pointer", background: "var(--dsw-alias-brand, #3b6ef0)", color: "#fff" },
  btnDanger: { border: "1px solid #e0b4b4", borderRadius: 7, padding: "5px 12px", fontSize: 13, cursor: "pointer", background: "#fff5f5", color: "#b03030" },
  input: { border: "1px solid var(--dsw-alias-border, #ccc)", borderRadius: 7, padding: "6px 10px", fontSize: 13, background: "var(--dsw-alias-bg, #fff)", color: "inherit", width: "100%" },
  label: { fontSize: 12, opacity: 0.75, display: "block", marginBottom: 3 },
  field: { marginBottom: 10, flex: "1 1 200px", minWidth: 180 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 8 },
  th: { textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--dsw-alias-border, #e2e2e2)", opacity: 0.7, fontWeight: 600, whiteSpace: "nowrap" },
  td: { padding: "6px 8px", borderBottom: "1px solid var(--dsw-alias-border, #f0f0f0)", verticalAlign: "top" },
  badge: { fontSize: 11, padding: "1px 7px", borderRadius: 20, background: "var(--dsw-alias-bg-muted, #eee)", whiteSpace: "nowrap" },
  toast: { padding: "8px 12px", borderRadius: 8, fontSize: 13, margin: "10px 0", background: "#eef6ee", border: "1px solid #cfe6cf", color: "#2c6e2c" },
  toastErr: { padding: "8px 12px", borderRadius: 8, fontSize: 13, margin: "10px 0", background: "#fdeeee", border: "1px solid #f0cccc", color: "#a33" },
  muted: { opacity: 0.6, fontSize: 12 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { background: "var(--dsw-alias-bg, #fff)", borderRadius: 12, padding: 20, width: "min(560px, 92vw)", maxHeight: "86vh", overflow: "auto", color: "var(--dsw-alias-label-primary, #1a1a1a)" },
};

function effortsLabel(e: ModelView["reasoningEfforts"]): string {
  if (e === false) return "—";
  if (!e) return "—";
  return Object.keys(e).join("/");
}

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
      await fn();
      setToast({ msg: okMsg });
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
        <div style={styles.section}>{t("providers")}</div>
        <div style={styles.row}>
          <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh(), t("ok"))}>{t("refreshAll")}</button>
          <button style={styles.btnPrimary} disabled={busy} onClick={() => { setEditRoute(null); setAddOpen(true); }}>{t("addProvider")}</button>
        </div>
      </div>

      {routeIds.length === 0 && <div style={styles.muted}>{t("noProviders")}</div>}

      {routeIds.map((id) => {
        const p = providers[id];
        const isOpen = expanded[id];
        return (
          <div key={id} style={styles.card}>
            <div style={styles.spread}>
              <div>
                <strong>{p.displayName || id}</strong> <span style={styles.muted}>({id})</span>
                <div style={styles.muted}>{p.baseURL} · {p.api} · {p.keyConfigured ? t("keyConfigured") : t("keyMissing")} · {p.modelCount} {t("models")}</div>
              </div>
              <div style={styles.row}>
                <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh([id]), t("ok"))}>{t("refresh")}</button>
                <button style={styles.btn} disabled={busy} onClick={async () => { setBusy(true); try { const r = await api.probe(id); setToast({ msg: `${r.protocol}: ${r.reachable ? "reachable" : "unreachable"}${r.status ? ` (HTTP ${r.status})` : ""}${r.error ? ` — ${r.error}` : ""}`, err: !r.reachable }); } catch (e) { setToast({ msg: String(e instanceof Error ? e.message : e), err: true }); } finally { setBusy(false); } }}>Probe</button>
                <button style={styles.btn} disabled={busy} onClick={() => { setEditRoute(id); setAddOpen(true); }}>{t("override")}</button>
                <button style={styles.btn} onClick={() => setExpanded((e) => ({ ...e, [id]: !e[id] }))}>{isOpen ? "▾" : "▸"} {t("models")}</button>
                <button style={styles.btnDanger} disabled={busy} onClick={() => run(() => api.removeProvider(id), t("ok"))}>{t("remove")}</button>
              </div>
            </div>

            {isOpen && (
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>{t("model")}</th>
                    <th style={styles.th}>{t("contextWindow")}</th>
                    <th style={styles.th}>{t("maxTokens")}</th>
                    <th style={styles.th}>{t("input")}</th>
                    <th style={styles.th}>{t("efforts")}</th>
                    <th style={styles.th}>{t("thinkingFormat")}</th>
                    <th style={styles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {(p.models ?? []).map((m) => (
                    <tr key={m.id}>
                      <td style={styles.td}>{m.name || m.id}{m.stale ? <span style={{ ...styles.badge, marginLeft: 6 }}>{t("stale")}</span> : null}<div style={styles.muted}>{m.id}</div></td>
                      <td style={styles.td}>{m.contextWindow?.toLocaleString() ?? "—"}</td>
                      <td style={styles.td}>{m.maxTokens?.toLocaleString() ?? "—"}</td>
                      <td style={styles.td}>{(m.input ?? []).join(", ") || "—"}</td>
                      <td style={styles.td}>{effortsLabel(m.reasoningEfforts)}</td>
                      <td style={styles.td}>{String(m.compat?.thinkingFormat ?? "—")}</td>
                      <td style={styles.td}><button style={styles.btn} onClick={() => setOverrideTarget({ route: id, model: m })}>{t("override")}</button></td>
                    </tr>
                  ))}
                  {(p.models ?? []).length === 0 && (
                    <tr><td style={styles.td} colSpan={7}>{t("noModels")}</td></tr>
                  )}
                </tbody>
              </table>
            )}
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
          onSubmit={(form) => run(async () => { await api.upsertProvider(form); setAddOpen(false); }, t("ok"))}
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
  const [apiProto, setApiProto] = useState(initial?.api ?? protocols[0] ?? "openai-completions");
  const [apiKey, setApiKey] = useState("");
  const editing = Boolean(initial?.id);
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.h1, fontSize: 17, marginBottom: 14 }}>{editing ? t("override") : t("addProvider")}</div>
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
            {protocols.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("apiKey")} {editing ? "(leave blank to keep)" : ""}</span>
          <input style={styles.input} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </label>
        <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 12 }}>
          <button style={styles.btn} onClick={onClose}>{t("cancel")}</button>
          <button style={styles.btnPrimary} disabled={busy || !id || !baseURL} onClick={() => onSubmit({ id, displayName, baseURL, api: apiProto, apiKey: apiKey || undefined })}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}

function OverrideForm({ route, model, onClose, onSubmit, busy }: {
  route: string;
  model: ModelView;
  onClose: () => void;
  onSubmit: (cap: Record<string, unknown>, clear: boolean) => void;
  busy: boolean;
}) {
  const [contextWindow, setContextWindow] = useState(model.contextWindow ?? 0);
  const [maxTokens, setMaxTokens] = useState(model.maxTokens ?? 0);
  const [input, setInput] = useState((model.input ?? ["text"]).join(","));
  const [efforts, setEfforts] = useState(model.reasoningEfforts ? JSON.stringify(model.reasoningEfforts) : "");
  const [thinkingFormat, setThinkingFormat] = useState(String(model.compat?.thinkingFormat ?? ""));
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.h1, fontSize: 17, marginBottom: 4 }}>{t("override")}: {model.id}</div>
        <div style={styles.muted}>{route}</div>
        <div style={{ height: 12 }} />
        <label style={styles.field}>
          <span style={styles.label}>{t("contextWindow")}</span>
          <input style={styles.input} type="number" value={contextWindow} onChange={(e) => setContextWindow(Number(e.target.value))} />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("maxTokens")}</span>
          <input style={styles.input} type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("input")} (comma-separated)</span>
          <input style={styles.input} value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("efforts")} (JSON, empty = keep)</span>
          <input style={styles.input} value={efforts} onChange={(e) => setEfforts(e.target.value)} placeholder='{"off":null,"high":"high"}' />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("thinkingFormat")}</span>
          <input style={styles.input} value={thinkingFormat} onChange={(e) => setThinkingFormat(e.target.value)} placeholder="deepseek / zai / qwen / openai" />
        </label>
        <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 12 }}>
          <button style={styles.btnDanger} disabled={busy} onClick={() => onSubmit({}, true)}>{t("clearOverride")}</button>
          <button style={styles.btn} onClick={onClose}>{t("cancel")}</button>
          <button style={styles.btnPrimary} disabled={busy} onClick={() => {
            const cap: Record<string, unknown> = {};
            if (contextWindow > 0) cap.contextWindow = contextWindow;
            if (maxTokens > 0) cap.maxTokens = maxTokens;
            if (input.trim()) cap.input = input.split(",").map((s) => s.trim()).filter(Boolean);
            if (efforts.trim()) { try { cap.reasoningEfforts = JSON.parse(efforts); } catch { /* ignore */ } }
            if (thinkingFormat.trim()) cap.compat = { ...(model.compat ?? {}), thinkingFormat: thinkingFormat.trim() };
            onSubmit(cap, false);
          }}>{t("save")}</button>
        </div>
      </div>
    </div>
  );
}