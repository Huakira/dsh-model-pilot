/**
 * Shared model-capability table used by both the standalone Model Pilot page
 * and the Models-page provider-card / footer integrations.
 */
import React from "react";
import type { ModelView, MatchInfoView } from "./api.js";
import { t } from "./i18n.js";
import { styles } from "./styles.js";

export function effortsLabel(e: ModelView["reasoningEfforts"]): string {
  if (e === false) return "—";
  if (!e) return "—";
  return Object.keys(e).join("/");
}

function sourceBadge(info: MatchInfoView | undefined): { label: string; tone: "authoritative" | "guess" } | null {
  if (!info) return null;
  if (info.sources.includes("pi-ai-catalog")) return { label: "pi-ai", tone: "authoritative" };
  if (info.sources.includes("models.dev")) return { label: "models.dev", tone: "authoritative" };
  return { label: t("estimated"), tone: "guess" };
}

export function MatchBadge({ info }: { info: MatchInfoView | undefined }) {
  const b = sourceBadge(info);
  if (!b) return null;
  const toneStyle = b.tone === "authoritative" ? styles.badgeSuccess : styles.badgeWarn;
  const title = info?.baseIdUsed ? `${info.sources.join(", ")} → ${info.baseIdUsed}` : (info?.sources.join(", ") ?? "");
  return <span title={title} style={{ ...styles.badge, ...toneStyle, marginLeft: 6 }}>{b.label}</span>;
}

export function ModelTable({ models, matchinfo, onOverride, compact = false }: {
  models: ModelView[];
  matchinfo: Record<string, MatchInfoView> | undefined;
  onOverride: (model: ModelView) => void;
  /** Narrow variant for the Models-page provider-card seat. */
  compact?: boolean;
}): React.ReactElement {
  const modelCell: React.CSSProperties = compact
    ? { ...styles.td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
    : styles.td;
  const actionCell: React.CSSProperties = compact
    ? { ...styles.td, width: 1, whiteSpace: "nowrap" }
    : styles.td;
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={{ ...styles.th, maxWidth: compact ? 220 : undefined }}>{t("model")}</th>
          {!compact && <th style={styles.th}>{t("contextWindow")}</th>}
          <th style={styles.th}>{t("maxTokens")}</th>
          <th style={styles.th}>{t("input")}</th>
          <th style={styles.th}>{t("efforts")}</th>
          <th style={styles.th}>{t("thinkingFormat")}</th>
          <th style={styles.th}></th>
        </tr>
      </thead>
      <tbody>
        {(models ?? []).map((m) => (
          <tr key={m.id}>
            <td style={modelCell}>
              {m.name || m.id}
              {m.stale ? <span style={{ ...styles.badge, ...styles.badgeWarn, marginLeft: 6 }}>{t("stale")}</span> : null}
              <MatchBadge info={matchinfo?.[m.id]} />
              <div style={styles.muted}>{m.id}</div>
            </td>
            {!compact && <td style={styles.td}>{m.contextWindow?.toLocaleString() ?? "—"}</td>}
            <td style={styles.td}>{m.maxTokens?.toLocaleString() ?? "—"}</td>
            <td style={styles.td}>{(m.input ?? []).join(", ") || "—"}</td>
            <td style={styles.td}>{effortsLabel(m.reasoningEfforts)}</td>
            <td style={styles.td}>{String(m.compat?.thinkingFormat ?? "—")}</td>
            <td style={actionCell}><button style={styles.btn} onClick={() => onOverride(m)}>{t("override")}</button></td>
          </tr>
        ))}
        {(models ?? []).length === 0 && (
          <tr><td style={styles.td} colSpan={compact ? 6 : 7}>{t("noModels")}</td></tr>
        )}
      </tbody>
    </table>
  );
}
