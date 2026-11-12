/**
 * Shared design tokens matching the official Models settings page.
 *
 * Every value resolves against the DSH `--dsw-alias-*` CSS custom properties
 * so the plugin surfaces adopt the active theme automatically. The structure
 * mirrors the official `.zGbnIq_*` classes (card fill/stroke, row actions,
 * inputs, badges) so the injected components read as part of the shell.
 */
import type React from "react";

export const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    color: "var(--dsw-alias-label-primary, #1a1a1a)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "inherit",
  },
  h1: {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    lineHeight: "24px",
    color: "var(--dsw-alias-label-primary)",
  },
  sub: {
    margin: 0,
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--dsw-alias-label-tertiary)",
  },
  section: {
    margin: "12px 0 0",
    fontSize: 14,
    fontWeight: 500,
    lineHeight: "22px",
    color: "var(--dsw-alias-label-primary)",
  },
  card: {
    border: "0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, #e2e2e2))",
    borderRadius: "var(--dsw-radius-xl, 12px)",
    background: "var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-module-platform, #fff))",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  row: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" },
  spread: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },

  /* Official secondary button (transparent + l3 border); compact in rows. */
  btn: {
    boxSizing: "border-box",
    height: 28,
    padding: "0 10px",
    borderRadius: "var(--dsw-radius-sm, 6px)",
    border: "0.5px solid var(--dsw-alias-border-l3, #d4d4d4)",
    background: "transparent",
    color: "var(--dsw-alias-label-primary)",
    font: "inherit",
    fontSize: 12,
    lineHeight: "18px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  /* Official primary button (brand fill). */
  btnPrimary: {
    boxSizing: "border-box",
    height: 36,
    padding: "0 14px",
    borderRadius: "var(--dsw-radius-md, 8px)",
    border: "none",
    background: "var(--dsw-alias-button-primary-fill, #3b6ef0)",
    color: "var(--dsw-alias-label-primary-foreground, #fff)",
    font: "inherit",
    fontSize: 14,
    lineHeight: "22px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  btnDanger: {
    boxSizing: "border-box",
    height: 28,
    padding: "0 10px",
    borderRadius: "var(--dsw-radius-sm, 6px)",
    border: "none",
    background: "transparent",
    color: "var(--dsw-alias-state-error-primary, #c0392b)",
    font: "inherit",
    fontSize: 12,
    lineHeight: "18px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },

  /* Official text input (32px, layer-1 fill, l4 border). */
  input: {
    boxSizing: "border-box",
    width: "100%",
    height: 32,
    padding: "0 10px",
    borderRadius: "var(--dsw-radius-md, 8px)",
    border: "0.5px solid var(--dsw-alias-border-l4, #dcdcdc)",
    background: "var(--dsw-alias-bg-layer-1, #fff)",
    color: "var(--dsw-alias-label-primary)",
    font: "inherit",
    fontSize: 13,
    lineHeight: "20px",
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "18px",
    color: "var(--dsw-alias-label-secondary)",
    display: "block",
    marginBottom: 4,
  },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px", minWidth: 180, marginBottom: 0 },

  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 4 },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)",
    color: "var(--dsw-alias-label-secondary)",
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "6px 8px",
    borderBottom: "0.5px solid var(--dsw-alias-border-l2, #f0f0f0)",
    verticalAlign: "top",
    color: "var(--dsw-alias-label-primary)",
  },

  badge: {
    fontSize: 11,
    lineHeight: "16px",
    padding: "1px 6px",
    borderRadius: "var(--dsw-radius-xs, 4px)",
    border: "0.5px solid var(--dsw-alias-border-l3, #d4d4d4)",
    background: "transparent",
    color: "var(--dsw-alias-label-secondary)",
    whiteSpace: "nowrap",
  },
  badgeSuccess: {
    border: "0.5px solid var(--dsw-alias-state-success-primary, #2c6e2c)",
    color: "var(--dsw-alias-state-success-primary, #2c6e2c)",
  },
  badgeWarn: {
    border: "0.5px solid var(--dsw-alias-state-warn-label, #a86a00)",
    color: "var(--dsw-alias-state-warn-label, #a86a00)",
  },

  toast: {
    padding: "8px 12px",
    borderRadius: "var(--dsw-radius-md, 8px)",
    fontSize: 12,
    lineHeight: "18px",
    background: "var(--dsw-alias-bg-module-platform, #f5f5f5)",
    border: "0.5px solid var(--dsw-alias-border-l3, #d4d4d4)",
    color: "var(--dsw-alias-label-primary)",
  },
  toastErr: {
    padding: "8px 12px",
    borderRadius: "var(--dsw-radius-md, 8px)",
    fontSize: 12,
    lineHeight: "18px",
    background: "transparent",
    border: "0.5px solid var(--dsw-alias-state-error-primary, #c0392b)",
    color: "var(--dsw-alias-state-error-primary, #c0392b)",
  },

  muted: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
  /**
   * Portal-mounted modal layer. z-index must beat the official settings
   * panel overlay (z-index:1000), or the modal's own mask covers the panel
   * and its close button — the "X does not respond" bug.
   */
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 },
  modal: {
    background: "var(--dsw-alias-bg-layer-1, #fff)",
    borderRadius: "var(--dsw-radius-xl, 12px)",
    border: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)",
    padding: "16px 18px",
    width: "min(560px, 92vw)",
    maxHeight: "86vh",
    overflow: "auto",
    color: "var(--dsw-alias-label-primary)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
};
