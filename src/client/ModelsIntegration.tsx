/**
 * Embeds Model Pilot into the official Models settings page.
 *
 * Two seats provided by `dsh-client-ui-settings-models`:
 * - `settings.models.provider-card` (keyed by `settingsNs`): renders inside
 *   every provider card of the pi-ai family (custom gateway routes included).
 *   We show this route's auto-matched model table with refresh / override.
 * - `settings.models.footer` (list): a global "refresh all" affordance.
 *
 * Both fetch the host routes over same-origin HTTP (owner-only), so they
 * behave identically to the standalone Model Pilot page.
 */
import React, { useCallback, useEffect, useState } from "react";
import { api, type StateResponse, type ModelView, type MatchInfoView } from "./api.js";
import { t } from "./i18n.js";
import { styles } from "./styles.js";
import { ModelTable } from "./ModelTable.js";
import { OverrideForm } from "./OverrideForm.js";

interface ProviderCardOwnerProps {
  provider: { provider: string; displayName: string; settingsNs: string };
  configured: boolean;
  keyConfigured: boolean;
  /** Present on some DSH builds; absent on 0.2.2-rc.1. */
  openSettings?: () => void;
}

function usePilotState(): { state: StateResponse | null; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<void>; toast: { msg: string; err?: boolean } | null } {
  const [state, setState] = useState<StateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const load = useCallback(async () => {
    try {
      setState(await api.state());
    } catch (error) {
      setToast({ msg: String(error instanceof Error ? error.message : error), err: true });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
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
  return { state, busy, run, toast };
}

/** One provider card's Model Pilot block (route-scoped). */
export function ProviderCardPilot(props: ProviderCardOwnerProps): React.ReactElement | null {
  const routeId = props.provider.provider;
  const { state, busy, run, toast } = usePilotState();
  const [expanded, setExpanded] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<ModelView | null>(null);
  const p = state?.providers?.[routeId];
  if (!state) return null;
  if (!p) return null; // route not managed by Model Pilot yet
  const matchinfo: Record<string, MatchInfoView> | undefined = state.matchinfo?.[routeId];

  return (
    <div style={{ borderTop: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={styles.spread}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...styles.muted, fontWeight: 500 }}>{t("pilotManaged")}</span>
          <span style={styles.muted}>{p.api} · {p.modelCount} {t("models")}</span>
        </div>
        <div style={styles.row}>
          {props.openSettings
            ? <a
                href="#"
                style={{ ...styles.muted, textDecoration: "underline", cursor: "pointer" }}
                onClick={(e) => { e.preventDefault(); props.openSettings?.(); }}
              >{t("openFullSettings")}</a>
            : <span style={styles.muted} title={t("openFullSettingsHint")}>{t("openFullSettingsShort")}</span>}
          <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh([routeId]), t("ok"))}>{t("refresh")}</button>
          <button style={styles.btn} onClick={() => setExpanded((e) => !e)}>{expanded ? "▾" : "▸"} {t("models")}</button>
        </div>
      </div>
      {toast && <div style={toast.err ? styles.toastErr : styles.toast}>{toast.msg}</div>}
      {expanded && (
        <ModelTable
          models={p.models ?? []}
          matchinfo={matchinfo}
          overridden={new Set(Object.keys(state?.overrides ?? {}).filter((k) => k.startsWith(routeId + "/")).map((k) => k.slice(routeId.length + 1)))}
          onOverride={(m) => setOverrideTarget(m)}
          onMove={state?.supportedProtocols?.length ? (m, protocol) => run(async () => {
            const r = await api.override(routeId, m.id, {}, false, protocol);
            return t("movedMsg").replace("{model}", m.id).replace("{to}", r.to ?? "").replace("{count}", String(r.mirrorModels ?? 0));
          }, t("ok")) : undefined}
          protocols={state?.supportedProtocols}
          routeProtocol={p.api}
          compact
        />
      )}
      {overrideTarget && (
        <OverrideForm
          route={routeId}
          model={overrideTarget}
          onClose={() => setOverrideTarget(null)}
          onSubmit={(cap, clear) => run(async () => { await api.override(routeId, overrideTarget.id, cap, clear); setOverrideTarget(null); }, t("ok"))}
          busy={busy}
        />
      )}
    </div>
  );
}

/** Footer seat: a compact global refresh strip. */
export function ModelsFooterPilot(): React.ReactElement {
  const { busy, run } = usePilotState();
  return (
    <div style={{ ...styles.spread, borderTop: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)", paddingTop: 12, marginTop: 4 }}>
      <div style={styles.muted}>{t("pilotFooterHint")}</div>
      <div style={styles.row}>
        <button style={styles.btn} disabled={busy} onClick={() => run(() => api.refresh(), t("ok"))}>{t("refreshAll")}</button>
      </div>
    </div>
  );
}
