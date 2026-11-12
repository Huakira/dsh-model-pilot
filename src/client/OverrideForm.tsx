/**
 * Per-model capability override modal, shared by the standalone page and the
 * Models-page provider-card integration.
 */
import React, { useState } from "react";
import type { ModelView } from "./api.js";
import { t } from "./i18n.js";
import { styles } from "./styles.js";
import { formatTokens } from "./ModelTable.js";
import { Modal } from "./Modal.js";

/** "262144" | "262K" | "1M" | "1.5M" → number; invalid → undefined. */
function parseTokens(raw: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kKmM]?)\s*$/.exec(raw);
  if (!m) return undefined;
  const v = Number(m[1]);
  if (!Number.isFinite(v)) return undefined;
  const mult = m[2].toLowerCase() === "k" ? 1_000 : m[2].toLowerCase() === "m" ? 1_000_000 : 1;
  return Math.round(v * mult);
}

export function OverrideForm({ route, model, onClose, onSubmit, busy }: {
  route: string;
  model: ModelView;
  onClose: () => void;
  onSubmit: (cap: Record<string, unknown>, clear: boolean) => void;
  busy: boolean;
}): React.ReactElement {
  const [contextWindow, setContextWindow] = useState(formatTokens(model.contextWindow ?? 0));
  const [maxTokens, setMaxTokens] = useState(formatTokens(model.maxTokens ?? 0));
  const [input, setInput] = useState((model.input ?? ["text"]).join(","));
  const [efforts, setEfforts] = useState(model.reasoningEfforts ? JSON.stringify(model.reasoningEfforts) : "");
  const [thinkingFormat, setThinkingFormat] = useState(String(model.compat?.thinkingFormat ?? ""));
  return (
    <Modal title={`${t("override")}: ${model.id}`} subtitle={route} onClose={onClose}>
        <label style={styles.field}>
          <span style={styles.label}>{t("contextWindow")} (K/M ok)</span>
          <input style={styles.input} value={contextWindow} onChange={(e) => setContextWindow(e.target.value)} placeholder="1000000 or 1M" />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>{t("maxTokens")} (K/M ok)</span>
          <input style={styles.input} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="131072 or 128K" />
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
            const cw = parseTokens(contextWindow);
            const mt = parseTokens(maxTokens);
            if (cw !== undefined && cw > 0) cap.contextWindow = cw;
            if (mt !== undefined && mt > 0) cap.maxTokens = mt;
            if (input.trim()) cap.input = input.split(",").map((s) => s.trim()).filter(Boolean);
            if (efforts.trim()) { try { cap.reasoningEfforts = JSON.parse(efforts); } catch { /* ignore */ } }
            if (thinkingFormat.trim()) cap.compat = { ...(model.compat ?? {}), thinkingFormat: thinkingFormat.trim() };
            onSubmit(cap, false);
          }}>{t("save")}</button>
        </div>
    </Modal>
  );
}
