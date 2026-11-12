window.__ModuleLoader__.load({
	id: "dsh-model-pilot",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/PilotSection.tsx
var import_react3 = __toESM(require("react"), 1);

// src/client/api.ts
var BASE = "/api/dsh-model-pilot";
async function call(path, method, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== void 0 ? { "content-type": "application/json" } : void 0,
    body: body !== void 0 ? JSON.stringify(body) : void 0,
    credentials: "same-origin"
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: `non-JSON response (${res.status})` };
  }
  if (!res.ok) {
    const err = data?.error ?? `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data;
}
var api = {
  state: () => call("/state", "GET"),
  refresh: (routes) => call("/refresh", "POST", { routes }),
  upsertProvider: (p) => call("/provider", "POST", { action: "upsert", ...p }),
  removeProvider: (id) => call("/provider", "POST", { action: "remove", id }),
  override: (route, model, capability, clear = false) => call("/override", "POST", { route, model, capability, clear }),
  rollback: (backupId) => call("/rollback", "POST", { backupId }),
  options: (patch) => call("/options", "POST", patch),
  probe: (route, model) => call("/probe", "POST", { route, model })
};

// src/client/i18n.ts
var en = {
  nav: "Model Pilot",
  title: "Model Pilot",
  subtitle: "Pull upstream models, auto-match capabilities, write to the official Models page.",
  providers: "Providers",
  addProvider: "Add provider",
  refresh: "Refresh",
  refreshAll: "Refresh all",
  routeId: "Route id",
  displayName: "Display name",
  baseURL: "Base URL",
  apiKey: "API key",
  protocol: "Protocol",
  save: "Save",
  cancel: "Cancel",
  remove: "Remove",
  models: "Models",
  model: "Model",
  contextWindow: "Context",
  maxTokens: "Max output",
  input: "Input",
  efforts: "Efforts",
  thinkingFormat: "Thinking format",
  override: "Override",
  clearOverride: "Clear override",
  options: "Options",
  deleteSync: "Remove stale models (no longer listed upstream)",
  autoRefresh: "Auto refresh",
  refreshIntervalHours: "Refresh interval (hours)",
  backupKeep: "Backups to keep",
  backups: "Backups",
  rollback: "Restore",
  noProviders: "No provider routes yet. Add one to begin.",
  noModels: "No models. Refresh to pull the upstream list.",
  keyConfigured: "key set",
  keyMissing: "no key",
  stale: "stale",
  catalog: "Catalog",
  seams: "Seams",
  loading: "Loading\u2026",
  error: "Error",
  ok: "Done",
  confidence: "Confidence",
  autoProtocol: "Auto-detect (smart match)",
  autoHint: "Auto-detect probes the endpoint and picks the protocol that returns models; you can still force a specific one.",
  probe: "Test reachability",
  probeHint: "Sends a minimal 1-token request to check the model responds.",
  reachable: "reachable",
  unreachable: "unreachable",
  addedMsg: "Saved \xB7 protocol {protocol} \xB7 {count} models",
  estimated: "est.",
  matchedBase: "matched via {base}",
  pilotManaged: "Model Pilot",
  pilotFooterHint: "Model Pilot keeps these routes' model capabilities auto-matched from official sources.",
  openFullSettings: "Open Model Pilot settings",
  openFullSettingsShort: "Settings \u2192 Model Pilot",
  openFullSettingsHint: "Add / remove providers and manage backups in Settings \u2192 Model Pilot."
};
var zh = {
  nav: "\u6A21\u578B\u9886\u822A",
  title: "\u6A21\u578B\u9886\u822A",
  subtitle: "\u62C9\u53D6\u4E0A\u6E38\u6A21\u578B\uFF0C\u81EA\u52A8\u5339\u914D\u80FD\u529B\uFF0C\u5199\u5165\u5B98\u65B9 Models \u9875\u3002",
  providers: "\u63D0\u4F9B\u5546",
  addProvider: "\u6DFB\u52A0\u63D0\u4F9B\u5546",
  refresh: "\u5237\u65B0",
  refreshAll: "\u5168\u90E8\u5237\u65B0",
  routeId: "\u8DEF\u7531 ID",
  displayName: "\u663E\u793A\u540D\u79F0",
  baseURL: "Base URL",
  apiKey: "API \u5BC6\u94A5",
  protocol: "\u534F\u8BAE",
  save: "\u4FDD\u5B58",
  cancel: "\u53D6\u6D88",
  remove: "\u5220\u9664",
  models: "\u6A21\u578B",
  model: "\u6A21\u578B",
  contextWindow: "\u4E0A\u4E0B\u6587",
  maxTokens: "\u6700\u5927\u8F93\u51FA",
  input: "\u8F93\u5165",
  efforts: "\u601D\u8003\u6863\u4F4D",
  thinkingFormat: "\u601D\u8003\u683C\u5F0F",
  override: "\u8986\u76D6",
  clearOverride: "\u6E05\u9664\u8986\u76D6",
  options: "\u9009\u9879",
  deleteSync: "\u5220\u9664\u5931\u6548\u6A21\u578B\uFF08\u4E0A\u6E38\u5DF2\u4E0B\u67B6\uFF09",
  autoRefresh: "\u81EA\u52A8\u5237\u65B0",
  refreshIntervalHours: "\u5237\u65B0\u95F4\u9694\uFF08\u5C0F\u65F6\uFF09",
  backupKeep: "\u4FDD\u7559\u5907\u4EFD\u6570",
  backups: "\u5907\u4EFD",
  rollback: "\u6062\u590D",
  noProviders: "\u8FD8\u6CA1\u6709\u63D0\u4F9B\u5546\u8DEF\u7531\u3002\u6DFB\u52A0\u4E00\u4E2A\u5F00\u59CB\u3002",
  noModels: "\u6682\u65E0\u6A21\u578B\u3002\u5237\u65B0\u4EE5\u62C9\u53D6\u4E0A\u6E38\u5217\u8868\u3002",
  keyConfigured: "\u5DF2\u8BBE\u5BC6\u94A5",
  keyMissing: "\u65E0\u5BC6\u94A5",
  stale: "\u5931\u6548",
  catalog: "\u76EE\u5F55",
  seams: "\u63A5\u7F1D",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  error: "\u9519\u8BEF",
  ok: "\u5B8C\u6210",
  confidence: "\u7F6E\u4FE1\u5EA6",
  autoProtocol: "\u667A\u80FD\u5339\u914D\uFF08\u81EA\u52A8\u63A2\u6D4B\uFF09",
  autoHint: "\u667A\u80FD\u5339\u914D\u4F1A\u63A2\u6D4B\u7AEF\u70B9\uFF0C\u81EA\u52A8\u9009\u7528\u80FD\u8FD4\u56DE\u6A21\u578B\u7684\u534F\u8BAE\uFF1B\u4E5F\u53EF\u624B\u52A8\u6307\u5B9A\u3002",
  probe: "\u8FDE\u901A\u6027\u6D4B\u8BD5",
  probeHint: "\u53D1\u9001\u4E00\u4E2A\u6700\u5C0F\uFF081 token\uFF09\u8BF7\u6C42\uFF0C\u68C0\u67E5\u6A21\u578B\u662F\u5426\u53EF\u8FBE\u3002",
  reachable: "\u53EF\u8FBE",
  unreachable: "\u4E0D\u53EF\u8FBE",
  addedMsg: "\u5DF2\u4FDD\u5B58 \xB7 \u534F\u8BAE {protocol} \xB7 {count} \u4E2A\u6A21\u578B",
  estimated: "\u4F30\u7B97",
  matchedBase: "\u7ECF {base} \u5339\u914D",
  pilotManaged: "\u6A21\u578B\u9886\u822A",
  pilotFooterHint: "\u6A21\u578B\u9886\u822A\u6301\u7EED\u4ECE\u5B98\u65B9\u6E90\u81EA\u52A8\u5339\u914D\u8FD9\u4E9B\u8DEF\u7531\u7684\u6A21\u578B\u80FD\u529B\u3002",
  openFullSettings: "\u6253\u5F00\u6A21\u578B\u9886\u822A\u8BBE\u7F6E",
  openFullSettingsShort: "\u8BBE\u7F6E \u2192 \u6A21\u578B\u9886\u822A",
  openFullSettingsHint: "\u5728\u300C\u8BBE\u7F6E \u2192 \u6A21\u578B\u9886\u822A\u300D\u91CC\u6DFB\u52A0/\u5220\u9664 provider\u3001\u7BA1\u7406\u5907\u4EFD\u3002"
};
function pick() {
  const lang = typeof navigator !== "undefined" && navigator.language || "en";
  return lang.toLowerCase().startsWith("zh") ? zh : en;
}
var dict = pick();
function t(key) {
  return dict[key] ?? en[key] ?? key;
}

// src/client/styles.ts
var styles = {
  page: {
    maxWidth: 720,
    color: "var(--dsw-alias-label-primary, #1a1a1a)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "inherit"
  },
  h1: {
    margin: 0,
    fontSize: 16,
    fontWeight: 500,
    lineHeight: "24px",
    color: "var(--dsw-alias-label-primary)"
  },
  sub: {
    margin: 0,
    fontSize: 13,
    lineHeight: "20px",
    color: "var(--dsw-alias-label-tertiary)"
  },
  section: {
    margin: "12px 0 0",
    fontSize: 14,
    fontWeight: 500,
    lineHeight: "22px",
    color: "var(--dsw-alias-label-primary)"
  },
  card: {
    border: "0.5px solid var(--dsw-alias-settings-card-stroke, var(--dsw-alias-border-l2, #e2e2e2))",
    borderRadius: "var(--dsw-radius-xl, 12px)",
    background: "var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-module-platform, #fff))",
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 12
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
    gap: 4
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
    gap: 4
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
    alignItems: "center"
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
    lineHeight: "20px"
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: "18px",
    color: "var(--dsw-alias-label-secondary)",
    display: "block",
    marginBottom: 4
  },
  field: { display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px", minWidth: 180, marginBottom: 0 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 4 },
  th: {
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)",
    color: "var(--dsw-alias-label-secondary)",
    fontWeight: 500,
    whiteSpace: "nowrap"
  },
  td: {
    padding: "6px 8px",
    borderBottom: "0.5px solid var(--dsw-alias-border-l2, #f0f0f0)",
    verticalAlign: "top",
    color: "var(--dsw-alias-label-primary)"
  },
  badge: {
    fontSize: 11,
    lineHeight: "16px",
    padding: "1px 6px",
    borderRadius: "var(--dsw-radius-xs, 4px)",
    border: "0.5px solid var(--dsw-alias-border-l3, #d4d4d4)",
    background: "transparent",
    color: "var(--dsw-alias-label-secondary)",
    whiteSpace: "nowrap"
  },
  badgeSuccess: {
    border: "0.5px solid var(--dsw-alias-state-success-primary, #2c6e2c)",
    color: "var(--dsw-alias-state-success-primary, #2c6e2c)"
  },
  badgeWarn: {
    border: "0.5px solid var(--dsw-alias-state-warn-label, #a86a00)",
    color: "var(--dsw-alias-state-warn-label, #a86a00)"
  },
  toast: {
    padding: "8px 12px",
    borderRadius: "var(--dsw-radius-md, 8px)",
    fontSize: 12,
    lineHeight: "18px",
    background: "var(--dsw-alias-bg-module-platform, #f5f5f5)",
    border: "0.5px solid var(--dsw-alias-border-l3, #d4d4d4)",
    color: "var(--dsw-alias-label-primary)"
  },
  toastErr: {
    padding: "8px 12px",
    borderRadius: "var(--dsw-radius-md, 8px)",
    fontSize: 12,
    lineHeight: "18px",
    background: "transparent",
    border: "0.5px solid var(--dsw-alias-state-error-primary, #c0392b)",
    color: "var(--dsw-alias-state-error-primary, #c0392b)"
  },
  muted: { fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1e3 },
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
    gap: 12
  }
};

// src/client/ModelTable.tsx
var import_react = __toESM(require("react"), 1);
function formatTokens(n) {
  if (n === void 0 || n === null) return "\u2014";
  if (n >= 1e6) {
    const v = n / 1e6;
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}M`;
  }
  if (n >= 1e3) {
    const v = n / 1e3;
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}K`;
  }
  return String(n);
}
function effortsLabel(e) {
  if (e === false) return "\u2014";
  if (!e) return "\u2014";
  const keys = Object.keys(e).filter((k) => k !== "off");
  if (keys.length === 0) return "\u2014";
  return keys.join("/");
}
function sourceBadge(info) {
  if (!info) return null;
  if (info.sources.includes("pi-ai-catalog")) return { label: "pi-ai", tone: "authoritative" };
  if (info.sources.includes("models.dev")) return { label: "models.dev", tone: "authoritative" };
  return { label: t("estimated"), tone: "guess" };
}
function MatchBadge({ info }) {
  const b = sourceBadge(info);
  if (!b) return null;
  const toneStyle = b.tone === "authoritative" ? styles.badgeSuccess : styles.badgeWarn;
  const title = info?.baseIdUsed ? `${info.sources.join(", ")} \u2192 ${info.baseIdUsed}` : info?.sources.join(", ") ?? "";
  return /* @__PURE__ */ import_react.default.createElement("span", { title, style: { ...styles.badge, ...toneStyle, marginLeft: 6 } }, b.label);
}
function ModelTable({ models, matchinfo, onOverride, compact = false }) {
  const modelCell = compact ? { ...styles.td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : styles.td;
  const actionCell = compact ? { ...styles.td, width: 1, whiteSpace: "nowrap" } : styles.td;
  return /* @__PURE__ */ import_react.default.createElement("table", { style: styles.table }, /* @__PURE__ */ import_react.default.createElement("thead", null, /* @__PURE__ */ import_react.default.createElement("tr", null, /* @__PURE__ */ import_react.default.createElement("th", { style: { ...styles.th, maxWidth: compact ? 220 : void 0 } }, t("model")), /* @__PURE__ */ import_react.default.createElement("th", { style: styles.th }, t("contextWindow")), /* @__PURE__ */ import_react.default.createElement("th", { style: styles.th }, t("maxTokens")), /* @__PURE__ */ import_react.default.createElement("th", { style: styles.th }, t("input")), /* @__PURE__ */ import_react.default.createElement("th", { style: styles.th }, t("efforts")), /* @__PURE__ */ import_react.default.createElement("th", { style: styles.th }, t("thinkingFormat")), /* @__PURE__ */ import_react.default.createElement("th", { style: styles.th }))), /* @__PURE__ */ import_react.default.createElement("tbody", null, (models ?? []).map((m) => /* @__PURE__ */ import_react.default.createElement("tr", { key: m.id }, /* @__PURE__ */ import_react.default.createElement("td", { style: modelCell }, m.name || m.id, m.stale ? /* @__PURE__ */ import_react.default.createElement("span", { style: { ...styles.badge, ...styles.badgeWarn, marginLeft: 6 } }, t("stale")) : null, /* @__PURE__ */ import_react.default.createElement(MatchBadge, { info: matchinfo?.[m.id] }), /* @__PURE__ */ import_react.default.createElement("div", { style: styles.muted }, m.id)), /* @__PURE__ */ import_react.default.createElement("td", { style: styles.td }, formatTokens(m.contextWindow)), /* @__PURE__ */ import_react.default.createElement("td", { style: styles.td }, formatTokens(m.maxTokens)), /* @__PURE__ */ import_react.default.createElement("td", { style: styles.td }, (m.input ?? []).join(", ") || "\u2014"), /* @__PURE__ */ import_react.default.createElement("td", { style: { ...styles.td, whiteSpace: "nowrap" } }, effortsLabel(m.reasoningEfforts)), /* @__PURE__ */ import_react.default.createElement("td", { style: styles.td }, String(m.compat?.thinkingFormat ?? "\u2014")), /* @__PURE__ */ import_react.default.createElement("td", { style: actionCell }, /* @__PURE__ */ import_react.default.createElement("button", { style: styles.btn, onClick: () => onOverride(m) }, t("override"))))), (models ?? []).length === 0 && /* @__PURE__ */ import_react.default.createElement("tr", null, /* @__PURE__ */ import_react.default.createElement("td", { style: styles.td, colSpan: 7 }, t("noModels")))));
}

// src/client/OverrideForm.tsx
var import_react2 = __toESM(require("react"), 1);
function OverrideForm({ route, model, onClose, onSubmit, busy }) {
  const [contextWindow, setContextWindow] = (0, import_react2.useState)(model.contextWindow ?? 0);
  const [maxTokens, setMaxTokens] = (0, import_react2.useState)(model.maxTokens ?? 0);
  const [input, setInput] = (0, import_react2.useState)((model.input ?? ["text"]).join(","));
  const [efforts, setEfforts] = (0, import_react2.useState)(model.reasoningEfforts ? JSON.stringify(model.reasoningEfforts) : "");
  const [thinkingFormat, setThinkingFormat] = (0, import_react2.useState)(String(model.compat?.thinkingFormat ?? ""));
  return /* @__PURE__ */ import_react2.default.createElement("div", { style: styles.overlay, onClick: onClose }, /* @__PURE__ */ import_react2.default.createElement("div", { style: styles.modal, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ import_react2.default.createElement("div", { style: { ...styles.h1, fontSize: 15 } }, t("override"), ": ", model.id), /* @__PURE__ */ import_react2.default.createElement("div", { style: styles.muted }, route), /* @__PURE__ */ import_react2.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react2.default.createElement("span", { style: styles.label }, t("contextWindow")), /* @__PURE__ */ import_react2.default.createElement("input", { style: styles.input, type: "number", value: contextWindow, onChange: (e) => setContextWindow(Number(e.target.value)) })), /* @__PURE__ */ import_react2.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react2.default.createElement("span", { style: styles.label }, t("maxTokens")), /* @__PURE__ */ import_react2.default.createElement("input", { style: styles.input, type: "number", value: maxTokens, onChange: (e) => setMaxTokens(Number(e.target.value)) })), /* @__PURE__ */ import_react2.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react2.default.createElement("span", { style: styles.label }, t("input"), " (comma-separated)"), /* @__PURE__ */ import_react2.default.createElement("input", { style: styles.input, value: input, onChange: (e) => setInput(e.target.value) })), /* @__PURE__ */ import_react2.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react2.default.createElement("span", { style: styles.label }, t("efforts"), " (JSON, empty = keep)"), /* @__PURE__ */ import_react2.default.createElement("input", { style: styles.input, value: efforts, onChange: (e) => setEfforts(e.target.value), placeholder: '{"off":null,"high":"high"}' })), /* @__PURE__ */ import_react2.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react2.default.createElement("span", { style: styles.label }, t("thinkingFormat")), /* @__PURE__ */ import_react2.default.createElement("input", { style: styles.input, value: thinkingFormat, onChange: (e) => setThinkingFormat(e.target.value), placeholder: "deepseek / zai / qwen / openai" })), /* @__PURE__ */ import_react2.default.createElement("div", { style: { ...styles.row, justifyContent: "flex-end", marginTop: 4 } }, /* @__PURE__ */ import_react2.default.createElement("button", { style: styles.btnDanger, disabled: busy, onClick: () => onSubmit({}, true) }, t("clearOverride")), /* @__PURE__ */ import_react2.default.createElement("button", { style: styles.btn, onClick: onClose }, t("cancel")), /* @__PURE__ */ import_react2.default.createElement("button", { style: styles.btnPrimary, disabled: busy, onClick: () => {
    const cap = {};
    if (contextWindow > 0) cap.contextWindow = contextWindow;
    if (maxTokens > 0) cap.maxTokens = maxTokens;
    if (input.trim()) cap.input = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (efforts.trim()) {
      try {
        cap.reasoningEfforts = JSON.parse(efforts);
      } catch {
      }
    }
    if (thinkingFormat.trim()) cap.compat = { ...model.compat ?? {}, thinkingFormat: thinkingFormat.trim() };
    onSubmit(cap, false);
  } }, t("save")))));
}

// src/client/PilotSection.tsx
var PROTOCOLS = ["openai-completions", "openai-responses", "anthropic-messages", "gemini"];
function PilotSection(_props) {
  const [state, setState] = (0, import_react3.useState)(null);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [toast, setToast] = (0, import_react3.useState)(null);
  const [expanded, setExpanded] = (0, import_react3.useState)({});
  const [addOpen, setAddOpen] = (0, import_react3.useState)(false);
  const [editRoute, setEditRoute] = (0, import_react3.useState)(null);
  const [overrideTarget, setOverrideTarget] = (0, import_react3.useState)(null);
  const load = (0, import_react3.useCallback)(async () => {
    try {
      setState(await api.state());
    } catch (error) {
      setToast({ msg: String(error instanceof Error ? error.message : error), err: true });
    }
  }, []);
  (0, import_react3.useEffect)(() => {
    void load();
  }, [load]);
  const run = (0, import_react3.useCallback)(async (fn, okMsg) => {
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
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.page }, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.h1 }, t("title")), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.sub }, t("subtitle")), state?.catalog && /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, t("catalog"), ": ", state.catalog.models, " models \xB7 ", state.catalog.providers, " providers", state.catalog.generatedAt ? ` \xB7 ${new Date(state.catalog.generatedAt).toISOString().slice(0, 10)}` : ""), state && !state.catalog && /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, t("catalog"), ": unavailable (", state.catalogError ?? "fallback", ")"), state?.modelsDev && /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, "models.dev: ", state.modelsDev.ok ? `${state.modelsDev.source}${state.modelsDev.fetchedAt ? ` \xB7 ${new Date(state.modelsDev.fetchedAt).toISOString().slice(0, 10)}` : ""}` : "unavailable", " \xB7 ", t("protocol"), ": ", (state.supportedProtocols ?? []).join(", ")), toast && /* @__PURE__ */ import_react3.default.createElement("div", { style: toast.err ? styles.toastErr : styles.toast }, toast.msg), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.spread }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { ...styles.section, margin: 0 } }, t("providers")), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.row }, /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, disabled: busy, onClick: () => run(() => api.refresh(), t("ok")) }, t("refreshAll")), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btnPrimary, disabled: busy, onClick: () => {
    setEditRoute(null);
    setAddOpen(true);
  } }, t("addProvider")))), routeIds.length === 0 && /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, t("noProviders")), routeIds.map((id) => {
    const p = providers[id];
    const isOpen = expanded[id];
    return /* @__PURE__ */ import_react3.default.createElement("div", { key: id, style: styles.card }, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.spread }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("strong", null, p.displayName || id), " ", /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.muted }, "(", id, ")"), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, p.baseURL, " \xB7 ", p.api, " \xB7 ", p.keyConfigured ? t("keyConfigured") : t("keyMissing"), " \xB7 ", p.modelCount, " ", t("models"))), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.row }, /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, disabled: busy, onClick: () => run(() => api.refresh([id]), t("ok")) }, t("refresh")), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, disabled: busy, title: t("probeHint"), onClick: async () => {
      setBusy(true);
      try {
        const r = await api.probe(id);
        setToast({ msg: `${r.protocol}: ${r.reachable ? t("reachable") : t("unreachable")}${r.status ? ` (HTTP ${r.status})` : ""}${r.error ? ` \u2014 ${r.error}` : ""}`, err: !r.reachable });
      } catch (e) {
        setToast({ msg: String(e instanceof Error ? e.message : e), err: true });
      } finally {
        setBusy(false);
      }
    } }, t("probe")), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, disabled: busy, onClick: () => {
      setEditRoute(id);
      setAddOpen(true);
    } }, t("override")), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, onClick: () => setExpanded((e) => ({ ...e, [id]: !e[id] })) }, isOpen ? "\u25BE" : "\u25B8", " ", t("models")), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btnDanger, disabled: busy, onClick: () => run(() => api.removeProvider(id), t("ok")) }, t("remove")))), isOpen && /* @__PURE__ */ import_react3.default.createElement(
      ModelTable,
      {
        models: p.models ?? [],
        matchinfo: state?.matchinfo?.[id],
        onOverride: (m) => setOverrideTarget({ route: id, model: m })
      }
    ));
  }), /* @__PURE__ */ import_react3.default.createElement(OptionsPanel, { state, busy, run }), /* @__PURE__ */ import_react3.default.createElement(BackupsPanel, { state, busy, run }), addOpen && /* @__PURE__ */ import_react3.default.createElement(
    ProviderForm,
    {
      initial: editRoute ? { id: editRoute, ...providers[editRoute] } : void 0,
      protocols: state?.supportedProtocols ?? PROTOCOLS,
      onClose: () => setAddOpen(false),
      onSubmit: (form) => run(async () => {
        const r = await api.upsertProvider(form);
        setAddOpen(false);
        const proto = r.detectedProtocol ?? r.route?.api ?? form.api ?? "";
        return t("addedMsg").replace("{protocol}", proto).replace("{count}", String(r.modelCount ?? 0));
      }, t("ok")),
      busy
    }
  ), overrideTarget && /* @__PURE__ */ import_react3.default.createElement(
    OverrideForm,
    {
      route: overrideTarget.route,
      model: overrideTarget.model,
      onClose: () => setOverrideTarget(null),
      onSubmit: (cap, clear) => run(async () => {
        await api.override(overrideTarget.route, overrideTarget.model.id, cap, clear);
        setOverrideTarget(null);
      }, t("ok")),
      busy
    }
  ));
}
function OptionsPanel({ state, busy, run }) {
  const o = state?.options ?? {};
  const [local, setLocal] = (0, import_react3.useState)({});
  (0, import_react3.useEffect)(() => {
    setLocal(o);
  }, [state]);
  const set = (k, v) => setLocal((s) => ({ ...s, [k]: v }));
  return /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.section }, t("options")), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.card }, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.row }, /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("deleteSync")), /* @__PURE__ */ import_react3.default.createElement("input", { type: "checkbox", checked: Boolean(local.deleteSync), onChange: (e) => set("deleteSync", e.target.checked) })), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("autoRefresh")), /* @__PURE__ */ import_react3.default.createElement("input", { type: "checkbox", checked: Boolean(local.autoRefresh), onChange: (e) => set("autoRefresh", e.target.checked) })), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("refreshIntervalHours")), /* @__PURE__ */ import_react3.default.createElement("input", { style: styles.input, type: "number", min: 1, value: Number(local.refreshIntervalHours ?? 24), onChange: (e) => set("refreshIntervalHours", Number(e.target.value)) })), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("backupKeep")), /* @__PURE__ */ import_react3.default.createElement("input", { style: styles.input, type: "number", min: 1, value: Number(local.backupKeep ?? 10), onChange: (e) => set("backupKeep", Number(e.target.value)) }))), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btnPrimary, disabled: busy, onClick: () => run(() => api.options(local), t("ok")) }, t("save"))));
}
function BackupsPanel({ state, busy, run }) {
  const backups = state?.backups ?? [];
  return /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.section }, t("backups")), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.card }, backups.length === 0 && /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, "\u2014"), backups.map((b) => /* @__PURE__ */ import_react3.default.createElement("div", { key: b.id, style: { ...styles.spread, padding: "5px 0" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, new Date(b.createdAt).toLocaleString(), " \xB7 ", b.reason, " \xB7 ", b.routes, " routes"), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, disabled: busy, onClick: () => run(() => api.rollback(b.id), t("ok")) }, t("rollback"))))));
}
function ProviderForm({ initial, protocols, onClose, onSubmit, busy }) {
  const [id, setId] = (0, import_react3.useState)(initial?.id ?? "");
  const [displayName, setDisplayName] = (0, import_react3.useState)(initial?.displayName ?? "");
  const [baseURL, setBaseURL] = (0, import_react3.useState)(initial?.baseURL ?? "");
  const [apiProto, setApiProto] = (0, import_react3.useState)(initial?.api ?? "auto");
  const [apiKey, setApiKey] = (0, import_react3.useState)("");
  const editing = Boolean(initial?.id);
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.overlay, onClick: onClose }, /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.modal, onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { ...styles.h1, fontSize: 17, marginBottom: 14 } }, editing ? t("override") : t("addProvider")), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("routeId")), /* @__PURE__ */ import_react3.default.createElement("input", { style: styles.input, value: id, disabled: editing, onChange: (e) => setId(e.target.value), placeholder: "completions" })), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("displayName")), /* @__PURE__ */ import_react3.default.createElement("input", { style: styles.input, value: displayName, onChange: (e) => setDisplayName(e.target.value) })), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("baseURL")), /* @__PURE__ */ import_react3.default.createElement("input", { style: styles.input, value: baseURL, onChange: (e) => setBaseURL(e.target.value), placeholder: "https://gateway.example/v1" })), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("protocol")), /* @__PURE__ */ import_react3.default.createElement("select", { style: styles.input, value: apiProto, onChange: (e) => setApiProto(e.target.value) }, /* @__PURE__ */ import_react3.default.createElement("option", { value: "auto" }, t("autoProtocol")), protocols.map((p) => /* @__PURE__ */ import_react3.default.createElement("option", { key: p, value: p }, p))), /* @__PURE__ */ import_react3.default.createElement("div", { style: styles.muted }, t("autoHint"))), /* @__PURE__ */ import_react3.default.createElement("label", { style: styles.field }, /* @__PURE__ */ import_react3.default.createElement("span", { style: styles.label }, t("apiKey"), " ", editing ? "(leave blank to keep)" : ""), /* @__PURE__ */ import_react3.default.createElement("input", { style: styles.input, type: "password", value: apiKey, onChange: (e) => setApiKey(e.target.value) })), /* @__PURE__ */ import_react3.default.createElement("div", { style: { ...styles.row, justifyContent: "flex-end", marginTop: 12 } }, /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btn, onClick: onClose }, t("cancel")), /* @__PURE__ */ import_react3.default.createElement("button", { style: styles.btnPrimary, disabled: busy || !id || !baseURL, onClick: () => onSubmit({ id, displayName, baseURL, api: apiProto, apiKey: apiKey || void 0 }) }, t("save")))));
}

// src/client/ModelsIntegration.tsx
var import_react4 = __toESM(require("react"), 1);
function usePilotState() {
  const [state, setState] = (0, import_react4.useState)(null);
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [toast, setToast] = (0, import_react4.useState)(null);
  const load = (0, import_react4.useCallback)(async () => {
    try {
      setState(await api.state());
    } catch (error) {
      setToast({ msg: String(error instanceof Error ? error.message : error), err: true });
    }
  }, []);
  (0, import_react4.useEffect)(() => {
    void load();
  }, [load]);
  const run = (0, import_react4.useCallback)(async (fn, okMsg) => {
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
function ProviderCardPilot(props) {
  const routeId = props.provider.provider;
  const { state, busy, run, toast } = usePilotState();
  const [expanded, setExpanded] = (0, import_react4.useState)(false);
  const [overrideTarget, setOverrideTarget] = (0, import_react4.useState)(null);
  const p = state?.providers?.[routeId];
  if (!state) return null;
  if (!p) return null;
  const matchinfo = state.matchinfo?.[routeId];
  return /* @__PURE__ */ import_react4.default.createElement("div", { style: { borderTop: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ import_react4.default.createElement("div", { style: styles.spread }, /* @__PURE__ */ import_react4.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ import_react4.default.createElement("span", { style: { ...styles.muted, fontWeight: 500 } }, t("pilotManaged")), /* @__PURE__ */ import_react4.default.createElement("span", { style: styles.muted }, p.api, " \xB7 ", p.modelCount, " ", t("models"))), /* @__PURE__ */ import_react4.default.createElement("div", { style: styles.row }, props.openSettings ? /* @__PURE__ */ import_react4.default.createElement(
    "a",
    {
      href: "#",
      style: { ...styles.muted, textDecoration: "underline", cursor: "pointer" },
      onClick: (e) => {
        e.preventDefault();
        props.openSettings?.();
      }
    },
    t("openFullSettings")
  ) : /* @__PURE__ */ import_react4.default.createElement("span", { style: styles.muted, title: t("openFullSettingsHint") }, t("openFullSettingsShort")), /* @__PURE__ */ import_react4.default.createElement("button", { style: styles.btn, disabled: busy, onClick: () => run(() => api.refresh([routeId]), t("ok")) }, t("refresh")), /* @__PURE__ */ import_react4.default.createElement("button", { style: styles.btn, onClick: () => setExpanded((e) => !e) }, expanded ? "\u25BE" : "\u25B8", " ", t("models")))), toast && /* @__PURE__ */ import_react4.default.createElement("div", { style: toast.err ? styles.toastErr : styles.toast }, toast.msg), expanded && /* @__PURE__ */ import_react4.default.createElement(ModelTable, { models: p.models ?? [], matchinfo, onOverride: (m) => setOverrideTarget(m), compact: true }), overrideTarget && /* @__PURE__ */ import_react4.default.createElement(
    OverrideForm,
    {
      route: routeId,
      model: overrideTarget,
      onClose: () => setOverrideTarget(null),
      onSubmit: (cap, clear) => run(async () => {
        await api.override(routeId, overrideTarget.id, cap, clear);
        setOverrideTarget(null);
      }, t("ok")),
      busy
    }
  ));
}
function ModelsFooterPilot() {
  const { busy, run } = usePilotState();
  return /* @__PURE__ */ import_react4.default.createElement("div", { style: { ...styles.spread, borderTop: "0.5px solid var(--dsw-alias-border-l2, #e2e2e2)", paddingTop: 12, marginTop: 4 } }, /* @__PURE__ */ import_react4.default.createElement("div", { style: styles.muted }, t("pilotFooterHint")), /* @__PURE__ */ import_react4.default.createElement("div", { style: styles.row }, /* @__PURE__ */ import_react4.default.createElement("button", { style: styles.btn, disabled: busy, onClick: () => run(() => api.refresh(), t("ok")) }, t("refreshAll"))));
}

// src/client/index.tsx
var name = "dsh-model-pilot";
var inject = ["slots"];
var PI_AI_NS = "llm-pi-ai";
function apply(ctx) {
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "dsh-model-pilot",
        order: 60,
        label: () => t("nav"),
        inject: () => ({ hooks: {} })
      },
      PilotSection
    )
  );
  ctx.slots.inject(
    "settings.models.provider-card",
    () => ctx.slots.register(
      { name: "settings.models.provider-card", key: PI_AI_NS },
      ProviderCardPilot
    )
  );
  ctx.slots.inject(
    "settings.models.footer",
    () => ctx.slots.register(
      { name: "settings.models.footer", id: "dsh-model-pilot-footer", order: 50 },
      ModelsFooterPilot
    )
  );
}

		return module.exports;
	}
});
