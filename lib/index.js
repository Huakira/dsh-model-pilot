// src/index.ts
import Schema from "@deepseek-ai/schemastery";
import { dirname as dirname4, join as join2 } from "node:path";
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, existsSync as existsSync4, mkdirSync as mkdirSync3 } from "node:fs";

// src/catalog.ts
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

// src/protocol.ts
function normalizeId(id) {
  return id.trim().toLowerCase();
}
function stripRoutingPrefix(id) {
  let out = normalizeId(id);
  out = out.replace(/^(auto|router|default)\//, "");
  return out;
}
function familyOf(id) {
  const s = stripRoutingPrefix(id);
  if (/(^|\/)claude|anthropic\./.test(s)) return "claude";
  if (/(^|\/)gemini|google\./.test(s)) return "gemini";
  if (/(^|\/)gpt-|(^|\/)o[1-9]|(^|\/)chatgpt/.test(s)) return "gpt";
  if (/(^|\/)grok|xai\./.test(s)) return "grok";
  if (/deepseek/.test(s)) return "deepseek";
  if (/(^|\/)qwen|qwq|qvq/.test(s)) return "qwen";
  if (/(^|\/)glm|zai|chatglm/.test(s)) return "glm";
  if (/(^|\/)kimi|moonshot/.test(s)) return "kimi";
  if (/minimax|abab/.test(s)) return "minimax";
  if (/mistral|mixtral|magistral|devstral/.test(s)) return "mistral";
  if (/llama|meta\./.test(s)) return "llama";
  return "generic";
}
function suggestProtocol(id) {
  switch (familyOf(id)) {
    case "claude":
      return "anthropic-messages";
    case "gemini":
      return "gemini";
    case "gpt":
    case "grok":
      return "openai-responses";
    default:
      return "openai-completions";
  }
}
function routeProtocol(routeApi, id) {
  if (routeApi && PROTOCOL_SET.has(routeApi)) return routeApi;
  return suggestProtocol(id);
}
var PROTOCOL_SET = /* @__PURE__ */ new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "gemini"
]);
function thinkingFormatFor(id, protocol) {
  if (protocol === "anthropic-messages" || protocol === "gemini") return void 0;
  switch (familyOf(id)) {
    case "deepseek":
      return "deepseek";
    case "glm":
      return "zai";
    case "qwen":
      return "qwen";
    case "gpt":
    case "grok":
    case "claude":
    case "generic":
    default:
      return "openai";
  }
}
function defaultEfforts(id) {
  switch (familyOf(id)) {
    case "deepseek":
      return { off: null, low: "low", high: "high", max: "max" };
    case "glm":
      return { low: "low", high: "high", max: "max" };
    case "qwen":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "gpt":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "grok":
      return { off: null, low: "low", high: "high" };
    case "claude":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "gemini":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "kimi":
    case "minimax":
    case "mistral":
      return { off: null, low: "low", high: "high" };
    default:
      return false;
  }
}
function familyReasons(id) {
  return defaultEfforts(id) !== false;
}
function compatFor(id, protocol) {
  const compat = {};
  const fmt = thinkingFormatFor(id, protocol);
  if (fmt !== void 0) compat.thinkingFormat = fmt;
  if (familyReasons(id)) compat.supportsReasoningEffort = true;
  compat.supportsDeveloperRole = false;
  if (familyOf(id) === "deepseek" && protocol === "openai-completions") {
    compat.requiresReasoningContentOnAssistantMessages = true;
  }
  return compat;
}

// src/catalog.ts
function buildCatalogIndex(loader) {
  const byId = /* @__PURE__ */ new Map();
  const providers = loader.providers();
  let modelCount = 0;
  for (const provider of providers) {
    let models = [];
    try {
      models = loader.models(provider);
    } catch {
      continue;
    }
    for (const model of models) {
      if (!model || typeof model.id !== "string" || model.type === "image" || model.type === "classifier") continue;
      modelCount++;
      const entry = { ...model, provider: model.provider ?? provider };
      for (const key of /* @__PURE__ */ new Set([normalizeId(entry.id), stripRoutingPrefix(entry.id)])) {
        const list = byId.get(key);
        if (list) list.push(entry);
        else byId.set(key, [entry]);
      }
    }
  }
  return { byId, providers, modelCount, generatedAt: loader.generatedAt?.() };
}
function lookupCatalog(index, id) {
  return index.byId.get(normalizeId(id)) ?? index.byId.get(stripRoutingPrefix(id)) ?? [];
}
function effortsFromLevelMap(map) {
  if (!map) return void 0;
  const out = {};
  for (const [level, wire] of Object.entries(map)) {
    if (typeof wire === "string") out[level] = wire;
    else if (level === "off") out.off = null;
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
function capabilityFromEntry(entry) {
  const cap = {};
  if (typeof entry.contextWindow === "number") cap.contextWindow = entry.contextWindow;
  if (typeof entry.maxTokens === "number") cap.maxTokens = entry.maxTokens;
  if (Array.isArray(entry.input)) cap.input = entry.input.filter((m) => typeof m === "string");
  const efforts = effortsFromLevelMap(entry.thinkingLevelMap);
  if (efforts) cap.reasoningEfforts = efforts;
  else if (entry.reasoning === false) cap.reasoningEfforts = false;
  if (entry.compat && typeof entry.compat === "object") {
    const c = entry.compat;
    const compat = {};
    for (const key of ["thinkingFormat", "requiresReasoningContentOnAssistantMessages", "forceAdaptiveThinking", "maxTokensField"]) {
      if (c[key] !== void 0) compat[key] = c[key];
    }
    if (Object.keys(compat).length > 0) cap.compat = compat;
  }
  return cap;
}
function resolvePiAiCatalogPath() {
  const candidates = [];
  try {
    const require2 = createRequire(import.meta.url);
    const adapterPath = require2.resolve("@deepseek-ai/dsh-llm-pi-ai");
    const adapterRequire = createRequire(adapterPath);
    candidates.push(adapterRequire.resolve("@earendil-works/pi-ai/providers/all"));
  } catch {
  }
  const roots = [];
  const globalRoot = join(dirname(process.execPath), "..", "lib", "node_modules");
  roots.push(join(globalRoot, "@deepseek-ai", "dsh", "node_modules"));
  roots.push(globalRoot);
  const dshHome = process.env.DSH_HOME ?? join(process.env.HOME ?? "~", ".dsh");
  const profilesDir = join(dshHome, "profiles");
  try {
    for (const profile of readdirSync(profilesDir)) roots.push(join(profilesDir, profile, "node_modules"));
  } catch {
  }
  for (const root of roots) {
    candidates.push(join(root, "@earendil-works/pi-ai/dist/providers/all.js"));
    candidates.push(join(root, "@deepseek-ai/dsh-llm-pi-ai/node_modules/@earendil-works/pi-ai/dist/providers/all.js"));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return void 0;
}
async function loadPiAiCatalog() {
  const path = resolvePiAiCatalogPath();
  if (!path) return void 0;
  try {
    const mod = await import(path);
    const loader = {
      providers: () => mod.getBuiltinProviders(),
      models: (p) => mod.getBuiltinModels(p),
      generatedAt: () => mod.getBuiltinModelDataGeneratedAt?.()
    };
    return buildCatalogIndex(loader);
  } catch {
    return void 0;
  }
}

// src/matcher.ts
var SOURCE_CONFIDENCE = {
  "pi-ai-catalog": 0.9,
  "models.dev": 0.75,
  endpoint: 0.4,
  "family-default": 0.3
};
function overlay(under, over) {
  const out = { ...under };
  if (over.contextWindow !== void 0) out.contextWindow = over.contextWindow;
  if (over.maxTokens !== void 0) out.maxTokens = over.maxTokens;
  if (over.input !== void 0) out.input = over.input;
  if (over.reasoningEfforts !== void 0) out.reasoningEfforts = over.reasoningEfforts;
  if (over.compat !== void 0) out.compat = { ...under.compat, ...over.compat };
  return out;
}
function matchModel(inputs) {
  const { id, endpoint, catalog, modelsDev, routeProtocol: routeProtocol2 } = inputs;
  const protocol = routeProtocol2 ?? suggestProtocol(id);
  const sources = [];
  const matchedProviders = [];
  let cap = {
    input: ["text"],
    reasoningEfforts: defaultEfforts(id),
    compat: compatFor(id, protocol)
  };
  sources.push("family-default");
  if (endpoint) {
    const epCap = {};
    if (endpoint.contextWindow !== void 0) epCap.contextWindow = endpoint.contextWindow;
    if (endpoint.maxTokens !== void 0) epCap.maxTokens = endpoint.maxTokens;
    if (endpoint.inputModalities && endpoint.inputModalities.length > 0) epCap.input = endpoint.inputModalities;
    if (Object.keys(epCap).length > 0) {
      cap = overlay(cap, epCap);
      sources.push("endpoint");
    }
  }
  if (modelsDev) {
    const md = modelsDev(id);
    if (md && Object.keys(md).length > 0) {
      cap = overlay(cap, md);
      sources.push("models.dev");
    }
  }
  if (catalog) {
    const entries = lookupCatalog(catalog, id);
    if (entries.length > 0) {
      let catalogCap = {};
      for (const entry of entries) {
        catalogCap = overlay(catalogCap, capabilityFromEntry(entry));
        if (entry.provider && !matchedProviders.includes(entry.provider)) matchedProviders.push(entry.provider);
      }
      cap = overlay(cap, catalogCap);
      sources.push("pi-ai-catalog");
    }
  }
  const confidence = sources.reduce((best, s) => Math.max(best, SOURCE_CONFIDENCE[s]), 0);
  const name2 = endpoint?.name ?? catalogName(catalog, id) ?? id;
  return {
    id,
    name: name2,
    capability: cap,
    confidence,
    sources,
    matchedProviders,
    suggestedProtocol: suggestProtocol(id)
  };
}
function catalogName(catalog, id) {
  if (!catalog) return void 0;
  const entries = lookupCatalog(catalog, id);
  return entries.find((e) => typeof e.name === "string")?.name;
}

// src/writer.ts
import { readFileSync, writeFileSync, existsSync as existsSync2, mkdirSync } from "node:fs";
import { dirname as dirname2 } from "node:path";
var PI_AI_NS = "llm-pi-ai";
function isConflict(error) {
  const e = error;
  return e?.code === "SETTINGS_CONFLICT" && typeof e.expected === "number" && typeof e.actual === "number";
}
function readProviders(settings) {
  const descriptor = settings.describe().find((d) => d.ns === PI_AI_NS);
  if (!descriptor) throw new Error(`no configurable plugin entry "${PI_AI_NS}"`);
  const value = descriptor.value;
  return { providers: structuredClone(value?.providers ?? {}), revision: descriptor.revision };
}
function extractCompatKeys(schema) {
  const root = schema;
  if (!root?.refs || root.uid === void 0) return void 0;
  const refs = root.refs;
  const keys = /* @__PURE__ */ new Set();
  let found = false;
  for (const node of Object.values(refs)) {
    if (node?.type === "object" && node.dict && "thinkingFormat" in node.dict) {
      found = true;
      for (const key of Object.keys(node.dict)) keys.add(key);
    }
  }
  return found ? keys : void 0;
}
function extractSupportedProtocols(schema) {
  const root = schema;
  if (!root?.refs || root.uid === void 0) return void 0;
  const refs = root.refs;
  const protocols = /* @__PURE__ */ new Set();
  let found = false;
  const collectConsts = (nodeId) => {
    const node = refs[String(nodeId)];
    if (!node) return;
    if (node.type === "const" && typeof node.value === "string") protocols.add(node.value);
    else if (node.type === "union" && Array.isArray(node.list)) for (const id of node.list) collectConsts(id);
  };
  for (const node of Object.values(refs)) {
    if (node?.type === "object" && node.dict && "api" in node.dict) {
      found = true;
      collectConsts(node.dict.api);
    }
  }
  return found ? [...protocols] : void 0;
}
function stripUnknownCompat(providers, allowed) {
  const stripped = [];
  const cleanCompat = (compat) => {
    if (!compat || typeof compat !== "object") return compat;
    const out = {};
    for (const [key, value] of Object.entries(compat)) {
      if (allowed.has(key)) out[key] = value;
      else if (!stripped.includes(key)) stripped.push(key);
    }
    return out;
  };
  const next = {};
  for (const [route, profile] of Object.entries(providers)) {
    const p = { ...profile };
    if (p.compat) p.compat = cleanCompat(p.compat);
    if (Array.isArray(p.models)) {
      p.models = p.models.map((m) => m.compat ? { ...m, compat: cleanCompat(m.compat) } : m);
    }
    if (p.modelOverrides) {
      const mo = {};
      for (const [id, override] of Object.entries(p.modelOverrides)) {
        const o = override;
        mo[id] = o.compat ? { ...o, compat: cleanCompat(o.compat) } : override;
      }
      p.modelOverrides = mo;
    }
    next[route] = p;
  }
  return { providers: next, stripped };
}
var Writer = class {
  constructor(settings, opts = {}) {
    this.settings = settings;
    this.opts = opts;
    this.keep = opts.backupKeep ?? 10;
    this.maxRetries = opts.maxRetries ?? 3;
    this.log = opts.log ?? (() => {
    });
    this.loadBackups();
  }
  settings;
  opts;
  backups = [];
  keep;
  maxRetries;
  log;
  loadBackups() {
    const path = this.opts.backupPath;
    if (!path || !existsSync2(path)) return;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(parsed)) this.backups = parsed;
    } catch {
      this.backups = [];
    }
  }
  persistBackups() {
    const path = this.opts.backupPath;
    if (!path) return;
    try {
      mkdirSync(dirname2(path), { recursive: true });
      writeFileSync(path, JSON.stringify(this.backups, null, 2), "utf8");
    } catch (error) {
      this.log(`failed to persist backups: ${String(error)}`);
    }
  }
  listBackups() {
    return [...this.backups].sort((a, b) => b.createdAt - a.createdAt);
  }
  /** Snapshot the current providers before a mutation. */
  snapshot(reason) {
    const { providers } = readProviders(this.settings);
    const backup = {
      id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      reason,
      providers
    };
    this.backups.push(backup);
    if (this.backups.length > this.keep) this.backups = this.backups.slice(-this.keep);
    this.persistBackups();
    return backup;
  }
  /**
   * Write a complete providers dict. Snapshots first, strips unknown compat
   * keys, retries on revision conflict, and reads back to verify.
   */
  async writeProviders(next, reason) {
    this.snapshot(reason);
    const descriptor = this.settings.describe().find((d) => d.ns === PI_AI_NS);
    const allowed = extractCompatKeys(descriptor?.schema);
    let payload = next;
    let stripped = [];
    if (allowed) {
      const result = stripUnknownCompat(next, allowed);
      payload = result.providers;
      stripped = result.stripped;
      if (stripped.length > 0) this.log(`stripped unsupported compat keys: ${stripped.join(", ")}`);
    }
    let attempt = 0;
    for (; ; ) {
      const { revision } = readProviders(this.settings);
      try {
        await this.settings.replace(PI_AI_NS, { providers: payload }, revision);
        break;
      } catch (error) {
        if (isConflict(error) && attempt < this.maxRetries) {
          attempt++;
          this.log(`revision conflict (expected ${error.expected}, actual ${error.actual}); retry ${attempt}`);
          continue;
        }
        throw error;
      }
    }
    const after = readProviders(this.settings);
    const expectedRoutes = Object.keys(payload).sort().join(",");
    const actualRoutes = Object.keys(after.providers).sort().join(",");
    if (expectedRoutes !== actualRoutes) {
      throw new Error(`read-back mismatch: wrote routes [${expectedRoutes}] but found [${actualRoutes}]`);
    }
    return { stripped };
  }
  /** Restore a backup snapshot by id. */
  async rollback(backupId) {
    const backup = this.backups.find((b) => b.id === backupId);
    if (!backup) throw new Error(`no backup "${backupId}"`);
    await this.writeProviders(backup.providers, `rollback to ${backup.id}`);
  }
};

// src/fetchers.ts
var MAX_BYTES = 4 * 1024 * 1024;
async function readBounded(response) {
  const declared = Number(response.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("listing exceeds 4MB");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) throw new Error("listing exceeds 4MB");
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
async function fetchGeminiListing(baseURL, apiKey, signal) {
  const base = baseURL.replace(/\/+$/, "");
  const url = `${base}/models${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`;
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`);
  const body = JSON.parse(await readBounded(response));
  const rows = [];
  for (const m of body.models ?? []) {
    if (!m.name) continue;
    if (Array.isArray(m.supportedGenerationMethods) && !m.supportedGenerationMethods.includes("generateContent")) continue;
    const id = m.name.replace(/^models\//, "");
    const row = { id, name: m.displayName ?? id };
    if (typeof m.inputTokenLimit === "number" && m.inputTokenLimit > 0) row.contextWindow = m.inputTokenLimit;
    if (typeof m.outputTokenLimit === "number" && m.outputTokenLimit > 0) row.maxTokens = m.outputTokenLimit;
    rows.push(row);
  }
  return rows;
}
async function probeModel(protocol, baseURL, modelId, apiKey, signal) {
  const base = baseURL.replace(/\/+$/, "");
  let url;
  let headers = { "content-type": "application/json", accept: "application/json" };
  let body;
  switch (protocol) {
    case "anthropic-messages":
      url = `${base}/v1/messages`;
      headers = { ...headers, "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" };
      body = { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
      break;
    case "openai-responses":
      url = `${base}/responses`;
      headers = { ...headers, authorization: `Bearer ${apiKey ?? ""}` };
      body = { model: modelId, input: "hi", max_output_tokens: 1 };
      break;
    case "gemini":
      url = `${base}/models/${encodeURIComponent(modelId)}:generateContent${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`;
      body = { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } };
      break;
    case "openai-completions":
    default:
      url = `${base}/chat/completions`;
      headers = { ...headers, authorization: `Bearer ${apiKey ?? ""}` };
      body = { model: modelId, messages: [{ role: "user", content: "hi" }], max_tokens: 1 };
      break;
  }
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    return { reachable: response.status < 500, status: response.status, protocol };
  } catch (error) {
    return { reachable: false, error: String(error instanceof Error ? error.message : error), protocol };
  }
}
var GEMINI_DEFAULT_INPUT = ["text", "image"];

// src/modelsdev.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2 } from "node:fs";
import { dirname as dirname3 } from "node:path";
var MODELS_DEV_URL = "https://models.dev/api.json";
var DEFAULT_TTL_MS = 24 * 3600 * 1e3;
function effortsFromOptions(reasoning, options) {
  if (reasoning === false) return false;
  if (!Array.isArray(options)) return void 0;
  const effort = options.find((o) => o?.type === "effort");
  if (effort && Array.isArray(effort.values) && effort.values.length > 0) {
    const out = { off: null };
    for (const v of effort.values) if (typeof v === "string") out[v] = v;
    return out;
  }
  if (options.some((o) => o?.type === "toggle")) return { off: null, high: "high" };
  return void 0;
}
function capabilityFromModelsDev(entry) {
  const cap = {};
  if (typeof entry.limit?.context === "number" && entry.limit.context > 0) cap.contextWindow = entry.limit.context;
  if (typeof entry.limit?.output === "number" && entry.limit.output > 0) cap.maxTokens = entry.limit.output;
  if (Array.isArray(entry.modalities?.input)) cap.input = entry.modalities.input.filter((m) => typeof m === "string");
  const efforts = effortsFromOptions(entry.reasoning, entry.reasoning_options);
  if (efforts !== void 0) cap.reasoningEfforts = efforts;
  return cap;
}
function buildModelsDevIndex(doc, fetchedAt) {
  const byId = /* @__PURE__ */ new Map();
  for (const provider of Object.values(doc)) {
    for (const [modelId, entry] of Object.entries(provider?.models ?? {})) {
      if (!entry || typeof entry !== "object") continue;
      const cap = capabilityFromModelsDev(entry);
      if (Object.keys(cap).length === 0) continue;
      for (const key of /* @__PURE__ */ new Set([normalizeId(modelId), stripRoutingPrefix(modelId)])) {
        const existing = byId.get(key);
        byId.set(key, existing ? { ...cap, ...existing } : cap);
      }
    }
  }
  return { byId, fetchedAt };
}
var ModelsDevSource = class {
  constructor(cachePath, ttlMs = DEFAULT_TTL_MS, fetchImpl = fetch) {
    this.cachePath = cachePath;
    this.ttlMs = ttlMs;
    this.fetchImpl = fetchImpl;
  }
  cachePath;
  ttlMs;
  fetchImpl;
  index;
  /** Load from fresh cache, else network (updating cache), else stale cache. */
  async load() {
    const cached = this.readCache();
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      this.index = cached;
      return { ok: true, source: "cache" };
    }
    try {
      const response = await this.fetchImpl(MODELS_DEV_URL, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = await response.json();
      const index = buildModelsDevIndex(doc, Date.now());
      this.index = index;
      this.writeCache(index);
      return { ok: true, source: "network" };
    } catch (error) {
      if (cached) {
        this.index = cached;
        return { ok: true, source: "stale", error: String(error instanceof Error ? error.message : error) };
      }
      return { ok: false, source: "none", error: String(error instanceof Error ? error.message : error) };
    }
  }
  lookup(id) {
    if (!this.index) return void 0;
    return this.index.byId.get(normalizeId(id)) ?? this.index.byId.get(stripRoutingPrefix(id));
  }
  get fetchedAt() {
    return this.index?.fetchedAt;
  }
  readCache() {
    if (!existsSync3(this.cachePath)) return void 0;
    try {
      const parsed = JSON.parse(readFileSync2(this.cachePath, "utf8"));
      if (!parsed?.byId) return void 0;
      return { byId: new Map(parsed.byId), fetchedAt: parsed.fetchedAt };
    } catch {
      return void 0;
    }
  }
  writeCache(index) {
    try {
      mkdirSync2(dirname3(this.cachePath), { recursive: true });
      writeFileSync2(this.cachePath, JSON.stringify({ fetchedAt: index.fetchedAt, byId: [...index.byId.entries()] }), "utf8");
    } catch {
    }
  }
};

// src/types.ts
var DEFAULT_OPTIONS = {
  managedRoutes: [],
  sourcePriority: ["pi-ai-catalog", "models.dev", "endpoint", "family-default"],
  probeEnabled: false,
  deleteSync: false,
  autoRefresh: false,
  refreshIntervalHours: 24,
  backupKeep: 10
};

// src/index.ts
var name = "dsh-model-pilot";
var inject = ["settings", "llm", "credentials", "connection"];
var API_BASE = "/api/dsh-model-pilot";
var FALLBACK_CONTEXT_WINDOW = 131072;
var FALLBACK_MAX_TOKENS = 8192;
var Config = Schema.object({
  managedRoutes: Schema.array(Schema.string()).default([]),
  probeEnabled: Schema.boolean().default(false),
  deleteSync: Schema.boolean().default(false),
  autoRefresh: Schema.boolean().default(false),
  refreshIntervalHours: Schema.natural().min(1).default(24),
  backupKeep: Schema.natural().min(1).default(10)
});
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
async function readBody(request) {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function apply(ctx, config = {}) {
  const options = {
    ...DEFAULT_OPTIONS,
    managedRoutes: config.managedRoutes ?? [],
    probeEnabled: config.probeEnabled ?? false,
    deleteSync: config.deleteSync ?? false,
    autoRefresh: config.autoRefresh ?? false,
    refreshIntervalHours: config.refreshIntervalHours ?? 24,
    backupKeep: config.backupKeep ?? 10
  };
  const settings = ctx.settings;
  const llm = ctx.llm;
  const credentials = ctx.credentials;
  const connection = ctx.connection;
  const seams = {
    settings: typeof settings?.update === "function" && typeof settings?.describe === "function",
    llmDiscovery: typeof llm?.discoverModels === "function",
    credentials: typeof credentials?.resolve === "function",
    connectionFetch: typeof connection?.fetch?.register === "function",
    catalog: false
  };
  const log = (msg) => ctx.logger?.info?.(`[dsh-model-pilot] ${msg}`) ?? console.log(`[dsh-model-pilot] ${msg}`);
  const warn = (msg) => ctx.logger?.warn?.(`[dsh-model-pilot] ${msg}`) ?? console.warn(`[dsh-model-pilot] ${msg}`);
  let stateDir = join2(process.env.DSH_HOME ?? join2(process.env.HOME ?? ".", ".dsh"), "storages", "dsh-model-pilot");
  try {
    const docPath = settings?.documentPath;
    if (typeof docPath === "string" && docPath.length > 0) stateDir = join2(dirname4(docPath), ".dsh-model-pilot");
  } catch {
  }
  mkdirSync3(stateDir, { recursive: true });
  const overridesPath = join2(stateDir, "overrides.json");
  const metaPath = join2(stateDir, "state.json");
  const writer = new Writer(settings, {
    backupPath: join2(stateDir, "backups.json"),
    backupKeep: options.backupKeep,
    log
  });
  let catalog;
  let catalogError;
  let supportedProtocols;
  const modelsDev = new ModelsDevSource(join2(stateDir, "modelsdev-cache.json"));
  let modelsDevStatus = { ok: false, source: "none" };
  const sourcesReady = (async () => {
    try {
      catalog = await loadPiAiCatalog();
      seams.catalog = catalog !== void 0;
      if (catalog) log(`pi-ai catalog loaded: ${catalog.modelCount} models across ${catalog.providers.length} providers`);
      else warn("pi-ai catalog unavailable; falling back to models.dev + family defaults");
    } catch (error) {
      catalogError = String(error);
      warn(`catalog load failed: ${catalogError}`);
    }
    try {
      const descriptor = settings?.describe().find((d) => d.ns === PI_AI_NS);
      supportedProtocols = extractSupportedProtocols(descriptor?.schema);
      if (supportedProtocols) log(`adapter protocols: ${supportedProtocols.join(", ")}`);
    } catch {
    }
    modelsDevStatus = await modelsDev.load();
    if (modelsDevStatus.ok) log(`models.dev ready (${modelsDevStatus.source})`);
    else warn(`models.dev unavailable: ${modelsDevStatus.error ?? "unknown"}`);
  })();
  const catalogReady = sourcesReady;
  const loadOverrides = () => {
    if (!existsSync4(overridesPath)) return {};
    try {
      return JSON.parse(readFileSync3(overridesPath, "utf8"));
    } catch {
      return {};
    }
  };
  const saveOverrides = (map) => {
    writeFileSync3(overridesPath, JSON.stringify(map, null, 2), "utf8");
  };
  const loadMeta = () => {
    if (!existsSync4(metaPath)) return {};
    try {
      return JSON.parse(readFileSync3(metaPath, "utf8"));
    } catch {
      return {};
    }
  };
  const saveMeta = (meta) => {
    writeFileSync3(metaPath, JSON.stringify(meta, null, 2), "utf8");
  };
  async function fetchListing(route, apiKey, signal) {
    const api = route.api ?? "openai-completions";
    if (api === "gemini") {
      const rows = await fetchGeminiListing(route.baseURL ?? "", apiKey, signal);
      return rows.map((r) => ({ ...r, inputModalities: r.inputModalities ?? GEMINI_DEFAULT_INPUT }));
    }
    if (!llm) throw new Error("llm discovery seam unavailable");
    return llm.discoverModels(PI_AI_NS, { baseURL: route.baseURL, api, apiKey }, signal);
  }
  function buildModels(routeId, route, listing, overrides) {
    const protocol = routeProtocol(route.api, "");
    const previous = new Map((route.models ?? []).map((m) => [m.id, m]));
    const seen = /* @__PURE__ */ new Set();
    const models = [];
    const added = [];
    for (const row of listing) {
      seen.add(row.id);
      const match = matchModel({ id: row.id, endpoint: row, catalog, modelsDev: (id) => modelsDev.lookup(id), routeProtocol: protocol });
      const cap = match.capability;
      const model = {
        id: row.id,
        name: match.name,
        contextWindow: cap.contextWindow ?? route.defaultContextWindow ?? FALLBACK_CONTEXT_WINDOW,
        maxTokens: cap.maxTokens ?? route.defaultMaxTokens ?? FALLBACK_MAX_TOKENS,
        input: cap.input ?? route.defaultInput ?? ["text"],
        ...cap.reasoningEfforts !== void 0 ? { reasoningEfforts: cap.reasoningEfforts } : {},
        ...cap.compat ? { compat: cap.compat } : {}
      };
      const override = overrides[`${routeId}/${row.id}`];
      if (override) Object.assign(model, override);
      if (!previous.has(row.id)) added.push(row.id);
      models.push(model);
    }
    const kept = [];
    if (!options.deleteSync) {
      for (const [id, model] of previous) {
        if (!seen.has(id)) {
          models.push({ ...model, stale: true });
          kept.push(id);
        }
      }
    }
    return { models, added, kept };
  }
  async function refreshRoutes(routeIds, reason) {
    if (!seams.settings) throw new Error("settings seam unavailable");
    await catalogReady;
    const { providers } = readProviders(settings);
    const targets = routeIds && routeIds.length > 0 ? routeIds : options.managedRoutes.length > 0 ? options.managedRoutes : Object.keys(providers);
    const overrides = loadOverrides();
    const next = structuredClone(providers);
    const perRoute = {};
    for (const routeId of targets) {
      const route = next[routeId];
      if (!route) {
        perRoute[routeId] = { error: "route not found" };
        continue;
      }
      try {
        const apiKey = route.apiKeyEnv && credentials ? (await credentials.resolve(route.apiKeyEnv))?.value : void 0;
        const listing = await fetchListing(route, apiKey);
        const { models, added, kept } = buildModels(routeId, route, listing, overrides);
        route.models = models;
        perRoute[routeId] = { ok: true, listed: listing.length, added: added.length, keptStale: kept.length, models: models.length };
      } catch (error) {
        perRoute[routeId] = { error: String(error instanceof Error ? error.message : error) };
      }
    }
    const { stripped } = await writer.writeProviders(next, reason);
    const meta = loadMeta();
    meta.lastRefresh = { at: Date.now(), reason, perRoute };
    saveMeta(meta);
    return { ok: true, perRoute, strippedCompatKeys: stripped };
  }
  if (!seams.connectionFetch) {
    warn("connection.fetch seam unavailable; settings page backend not registered");
    return;
  }
  const reg = connection.fetch.register.bind(connection.fetch);
  const guard = (fn) => async (request) => {
    try {
      return await fn(request);
    } catch (error) {
      return json({ ok: false, error: String(error instanceof Error ? error.message : error) }, 500);
    }
  };
  reg({
    path: `${API_BASE}/state`,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: guard(async () => {
      await catalogReady;
      const { providers, revision } = seams.settings ? readProviders(settings) : { providers: {}, revision: 0 };
      const masked = {};
      for (const [id, route] of Object.entries(providers)) {
        const keyInfo = route.apiKeyEnv && credentials ? await credentials.describe(route.apiKeyEnv) : void 0;
        masked[id] = {
          displayName: route.displayName,
          api: route.api,
          baseURL: route.baseURL,
          apiKeyEnv: route.apiKeyEnv,
          keyConfigured: keyInfo?.configured ?? false,
          modelCount: (route.models ?? []).length,
          models: route.models ?? []
        };
      }
      return json({
        ok: true,
        seams,
        catalog: catalog ? { models: catalog.modelCount, providers: catalog.providers.length, generatedAt: catalog.generatedAt } : null,
        catalogError,
        supportedProtocols: supportedProtocols ?? ["openai-completions", "openai-responses", "anthropic-messages"],
        modelsDev: { ok: modelsDevStatus.ok, source: modelsDevStatus.source, fetchedAt: modelsDev.fetchedAt },
        options,
        revision,
        providers: masked,
        overrides: loadOverrides(),
        backups: writer.listBackups().map((b) => ({ id: b.id, createdAt: b.createdAt, reason: b.reason, routes: Object.keys(b.providers).length })),
        meta: loadMeta()
      });
    })
  });
  reg({
    path: `${API_BASE}/refresh`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const routes = Array.isArray(body.routes) ? body.routes : void 0;
      const result = await refreshRoutes(routes, "manual refresh");
      return json(result);
    })
  });
  reg({
    path: `${API_BASE}/provider`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const action = body.action ?? "upsert";
      const id = String(body.id ?? "").trim();
      if (!id) return json({ ok: false, error: "provider id required" }, 400);
      if (!seams.settings) return json({ ok: false, error: "settings seam unavailable" }, 500);
      const { providers } = readProviders(settings);
      const next = structuredClone(providers);
      if (action === "remove") {
        delete next[id];
        await writer.writeProviders(next, `remove provider ${id}`);
        return json({ ok: true, removed: id });
      }
      const existing = next[id] ?? {};
      const route = { ...existing };
      if (typeof body.displayName === "string") route.displayName = body.displayName;
      if (typeof body.baseURL === "string") route.baseURL = body.baseURL.trim();
      if (typeof body.api === "string") route.api = body.api;
      if (typeof body.apiKey === "string" && body.apiKey.length > 0) {
        const ref = typeof body.apiKeyEnv === "string" && body.apiKeyEnv || route.apiKeyEnv || `DSH_MODEL_PILOT_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
        if (!credentials) return json({ ok: false, error: "credentials seam unavailable" }, 500);
        await credentials.set(ref, body.apiKey);
        route.apiKeyEnv = ref;
      } else if (typeof body.apiKeyEnv === "string") {
        route.apiKeyEnv = body.apiKeyEnv;
      }
      if (!route.api) route.api = "openai-completions";
      if (supportedProtocols && !supportedProtocols.includes(route.api)) {
        return json({ ok: false, error: `protocol "${route.api}" is not supported by the installed adapter (offers: ${supportedProtocols.join(", ")})` }, 400);
      }
      if (!Array.isArray(route.models)) route.models = [];
      next[id] = route;
      await writer.writeProviders(next, `upsert provider ${id}`);
      return json({ ok: true, id, route: { ...route, apiKeyEnv: route.apiKeyEnv } });
    })
  });
  reg({
    path: `${API_BASE}/override`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const routeId = String(body.route ?? "");
      const modelId = String(body.model ?? "");
      if (!routeId || !modelId) return json({ ok: false, error: "route and model required" }, 400);
      const overrides = loadOverrides();
      const key = `${routeId}/${modelId}`;
      if (body.clear === true) {
        delete overrides[key];
      } else {
        const patch = body.capability ?? {};
        overrides[key] = { ...overrides[key], ...patch };
      }
      saveOverrides(overrides);
      if (seams.settings) {
        const { providers } = readProviders(settings);
        const next = structuredClone(providers);
        const route = next[routeId];
        const model = route?.models?.find((m) => m.id === modelId);
        if (model) {
          if (body.clear === true) {
          } else {
            Object.assign(model, overrides[key]);
          }
          await writer.writeProviders(next, `override ${key}`);
        }
      }
      return json({ ok: true, key, override: overrides[key] ?? null });
    })
  });
  reg({
    path: `${API_BASE}/rollback`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const id = String(body.backupId ?? "");
      if (!id) return json({ ok: false, error: "backupId required" }, 400);
      await writer.rollback(id);
      return json({ ok: true, restored: id });
    })
  });
  reg({
    path: `${API_BASE}/options`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const patch = {};
      for (const key of ["managedRoutes", "probeEnabled", "deleteSync", "autoRefresh", "refreshIntervalHours", "backupKeep"]) {
        if (body[key] !== void 0) patch[key] = body[key];
      }
      if (seams.settings) {
        const descriptor = settings.describe().find((d) => d.ns === name);
        await settings.update(name, patch, descriptor?.revision);
      }
      Object.assign(options, patch);
      return json({ ok: true, options });
    })
  });
  reg({
    path: `${API_BASE}/probe`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const routeId = String(body.route ?? "");
      if (!seams.settings) return json({ ok: false, error: "settings seam unavailable" }, 500);
      const { providers } = readProviders(settings);
      const route = providers[routeId];
      if (!route) return json({ ok: false, error: "route not found" }, 400);
      const modelId = typeof body.model === "string" && body.model ? body.model : route.models?.[0]?.id ?? "";
      if (!modelId) return json({ ok: false, error: "no model to probe (refresh first or pass model)" }, 400);
      const apiKey = route.apiKeyEnv && credentials ? (await credentials.resolve(route.apiKeyEnv))?.value : void 0;
      const protocol = routeProtocol(route.api, modelId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15e3);
      try {
        const result = await probeModel(protocol, route.baseURL ?? "", modelId, apiKey, controller.signal);
        return json({ ok: true, route: routeId, model: modelId, ...result });
      } finally {
        clearTimeout(timer);
      }
    })
  });
  if (options.autoRefresh && seams.settings && seams.llmDiscovery) {
    const intervalMs = options.refreshIntervalHours * 3600 * 1e3;
    const timer = setInterval(() => {
      refreshRoutes(void 0, "auto refresh").catch((error) => warn(`auto refresh failed: ${String(error)}`));
    }, intervalMs);
    ctx.effect?.(() => () => clearInterval(timer), "dsh-model-pilot: auto refresh");
  }
  log(`host applied (seams: ${JSON.stringify(seams)})`);
}
export {
  Config,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
