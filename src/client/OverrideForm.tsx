/**
 * Per-model capability override modal, shared by the standalone page and the
 * Models-page provider-card integration.
 */
import React, { useState } from "react";
import type { ModelView } from "./api.js";
import { t } from "./i18n.js";
import { styles } from "./styles.js";

export function OverrideForm({ route, model, onClose, onSubmit, busy }: {
  route: string;
  model: ModelView;
  onClose: () => void;
  onSubmit: (cap: Record<string, unknown>, clear: boolean) => void;
  busy: boolean;
}): React.ReactElement {
  const [contextWindow, setContextWindow] = useState(model.contextWindow ?? 0);
  const [maxTokens, setMaxTokens] = useState(model.maxTokens ?? 0);
  const [input, setInput] = useState((model.input ?? ["text"]).join(","));
  const [efforts, setEfforts] = useState(model.reasoningEfforts ? JSON.stringify(model.reasoningEfforts) : "");
  const [thinkingFormat, setThinkingFormat] = useState(String(model.compat?.thinkingFormat ?? ""));
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...styles.h1, fontSize: 15 }}>{t("override")}: {model.id}</div>
        <div style={styles.muted}>{route}</div>
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
        <div style={{ ...styles.row, justifyContent: "flex-end", marginTop: 4 }}>
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
