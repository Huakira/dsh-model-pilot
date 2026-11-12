/**
 * models.dev as the primary capability source.
 *
 * Fetches https://models.dev/api.json (provider -> models map), caches it to
 * disk with a TTL, and falls back to the stale cache when offline. Only
 * capability facts are read (context/output limits, input modalities, reasoning
 * options) — the `api`/endpoint fields are deliberately ignored so a gateway's
 * baseURL is never overwritten.
 *
 * Data quality: models.dev is updated continuously (~235 providers, ~9k models)
 * and beats the static pi-ai catalog on recent releases (e.g. gpt-6.1-sol).
 * Cross-provider disagreement is resolved by majority vote per field.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeId, stripRoutingPrefix, baseModelId } from "./protocol.js";
import type { ModelCapability, Modality, ReasoningEfforts } from "./types.js";

export const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_TTL_MS = 24 * 3600 * 1000;

/** Modalities the pi-ai adapter accepts (adapted at write time, but we
 * pre-filter here so the matcher sees the true capability set). */
const ADAPTER_MODALITIES: ReadonlySet<string> = new Set(["text", "image"]);

interface ModelsDevEntry {
  id?: string;
  name?: string;
  reasoning?: boolean;
  reasoning_options?: { type?: string; values?: string[] }[];
  attachment?: boolean;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
}

interface ModelsDevProvider {
  models?: Record<string, ModelsDevEntry>;
}

/** A consensus capability with the number of providers that agreed. */
interface ConsensusCap extends ModelCapability {
  votes: number;
}

export interface ModelsDevIndex {
  byId: Map<string, ModelCapability>;
  byBase: Map<string, ModelCapability>;
  fetchedAt: number;
}

// ---- consensus helpers ----------------------------------------------------

/** Return the most frequent non-undefined value (majority vote). */
function consensus<T>(values: (T | undefined)[], eq: (a: T, b: T) => boolean): T | undefined {
  const candidates: T[] = [];
  for (const v of values) if (v !== undefined && !candidates.some((c) => eq(c, v))) candidates.push(v);
  let best: T | undefined;
  let bestCount = 0;
  for (const c of candidates) {
    const count = values.filter((v) => v !== undefined && eq(v, c)).length;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}

function eqNum(a: number, b: number): boolean { return a === b; }
function eqBool(a: boolean, b: boolean): boolean { return a === b; }
function eqStrOrNull(a: string | null, b: string | null): boolean { return a === b; }
function eqModalityArr(a: Modality[], b: Modality[]): boolean {
  return a.length === b.length && a.every((m, i) => m === b[i]);
}

/**
 * Map a models.dev effort value to pi-ai's canonical spelling.
 * models.dev uses "none" for no-thinking; pi-ai uses "off".
 */
function mapEffortValue(v: string): string | null {
  const lower = v.trim().toLowerCase();
  if (lower === "none") return null; // "no thinking" maps to pi-ai's off:null
  return lower;
}

function effortsFromOptions(
  reasoning: boolean | undefined,
  options: ModelsDevEntry["reasoning_options"],
): ReasoningEfforts | false | undefined {
  if (reasoning === false) return false;
  if (!Array.isArray(options)) return undefined;
  const effort = options.find((o) => o?.type === "effort");
  if (effort && Array.isArray(effort.values) && effort.values.length > 0) {
    const out: ReasoningEfforts = {};
    for (const raw of effort.values) {
      if (typeof raw !== "string") continue;
      const mapped = mapEffortValue(raw);
      const key = mapped ?? "off";
      out[key] = mapped;
    }
    // Guarantee an off entry exists (some providers list none, others don't).
    if (!("off" in out)) out.off = null;
    return out;
  }
  if (options.some((o) => o?.type === "toggle")) return { off: null, high: "high" };
  return undefined;
}

export function capabilityFromModelsDev(entry: ModelsDevEntry): ModelCapability {
  const cap: ModelCapability = {};
  if (typeof entry.limit?.context === "number" && entry.limit.context > 0) cap.contextWindow = entry.limit.context;
  if (typeof entry.limit?.output === "number" && entry.limit.output > 0) cap.maxTokens = entry.limit.output;
  if (Array.isArray(entry.modalities?.input)) {
    // Keep only what the adapter accepts; downstream also filters, but this
    // keeps the matched capability clean.
    cap.input = entry.modalities.input
      .filter((m): m is string => typeof m === "string" && ADAPTER_MODALITIES.has(m))
      .map((m) => m as Modality);
  }
  const efforts = effortsFromOptions(entry.reasoning, entry.reasoning_options);
  if (efforts !== undefined) cap.reasoningEfforts = efforts;
  return cap;
}

/** Build a cross-provider id index from the parsed api.json document. */
export function buildModelsDevIndex(doc: Record<string, ModelsDevProvider>, fetchedAt: number): ModelsDevIndex {
  // Group capabilities by normalized id so we can majority-vote disagreements.
  const byIdCaps = new Map<string, ConsensusCap[]>();

  const push = (key: string, cap: ModelCapability) => {
    if (Object.keys(cap).length === 0) return;
    const list = byIdCaps.get(key) ?? [];
    // Deduplicate: if an identical capability is already recorded, bump its vote
    // instead of appending (many providers re-list the same upstream model).
    const found = list.find(
      (c) =>
        c.contextWindow === cap.contextWindow &&
        c.maxTokens === cap.maxTokens &&
        c.reasoningEfforts === cap.reasoningEfforts &&
        eqModalityArr(c.input ?? [], cap.input ?? []),
    );
    if (found) found.votes += 1;
    else list.push({ ...cap, votes: 1 });
    byIdCaps.set(key, list);
  };

  for (const provider of Object.values(doc)) {
    for (const [modelId, entry] of Object.entries(provider?.models ?? {})) {
      if (!entry || typeof entry !== "object") continue;
      const cap = capabilityFromModelsDev(entry);
      for (const key of new Set([normalizeId(modelId), stripRoutingPrefix(modelId)])) {
        push(key, cap);
      }
    }
  }

  const byId = new Map<string, ModelCapability>();
  for (const [key, caps] of byIdCaps) {
    byId.set(key, consensusCap(caps));
  }

  // Base-id index: reduce each key to its base id and majority-vote there too.
  const byBaseCaps = new Map<string, ConsensusCap[]>();
  for (const [key, cap] of byId) {
    const base = baseModelId(key);
    if (base === key) continue; // exact match already covers it
    const list = byBaseCaps.get(base) ?? [];
    const found = list.find(
      (c) =>
        c.contextWindow === cap.contextWindow &&
        c.maxTokens === cap.maxTokens &&
        c.reasoningEfforts === cap.reasoningEfforts &&
        eqModalityArr(c.input ?? [], cap.input ?? []),
    );
    if (found) found.votes += 1;
    else list.push({ ...cap, votes: 1 });
    byBaseCaps.set(base, list);
  }
  const byBase = new Map<string, ModelCapability>();
  for (const [base, caps] of byBaseCaps) {
    byBase.set(base, consensusCap(caps));
  }

  return { byId, byBase, fetchedAt };
}

/** Majority-vote the candidate capabilities into one. */
function consensusCap(caps: ConsensusCap[]): ModelCapability {
  const out: ModelCapability = {};
  const ctx = consensus(caps.map((c) => c.contextWindow), eqNum);
  if (ctx !== undefined) out.contextWindow = ctx;
  const max = consensus(caps.map((c) => c.maxTokens), eqNum);
  if (max !== undefined) out.maxTokens = max;
  const inp = consensus(caps.map((c) => c.input), eqModalityArr);
  if (inp !== undefined && inp.length > 0) out.input = inp;
  const eff = consensus<ReasoningEfforts | false>(caps.map((c) => c.reasoningEfforts), (a, b) => {
    if (a === false || b === false) return a === b;
    if (!a || !b) return false;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
  });
  if (eff !== undefined) out.reasoningEfforts = eff;
  return out;
}

export class ModelsDevSource {
  private index: ModelsDevIndex | undefined;
  constructor(private cachePath: string, private ttlMs: number = DEFAULT_TTL_MS, private fetchImpl: typeof fetch = fetch) {}

  /** Load from fresh cache, else network (updating cache), else stale cache. */
  async load(): Promise<{ ok: boolean; source: "cache" | "network" | "stale" | "none"; error?: string }> {
    const cached = this.readCache();
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      this.index = cached;
      return { ok: true, source: "cache" };
    }
    try {
      const response = await this.fetchImpl(MODELS_DEV_URL, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = (await response.json()) as Record<string, ModelsDevProvider>;
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

  lookup(id: string): ModelCapability | undefined {
    if (!this.index) return undefined;
    return this.index.byId.get(normalizeId(id)) ?? this.index.byId.get(stripRoutingPrefix(id));
  }

  /** Fallback: look up by the base model id (vendor prefix / variant stripped). */
  lookupBase(id: string): ModelCapability | undefined {
    if (!this.index) return undefined;
    const base = baseModelId(id);
    return this.index.byBase.get(base);
  }

  get fetchedAt(): number | undefined {
    return this.index?.fetchedAt;
  }

  private readCache(): ModelsDevIndex | undefined {
    if (!existsSync(this.cachePath)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(this.cachePath, "utf8")) as {
        fetchedAt: number;
        byId: [string, ModelCapability][];
        byBase?: [string, ModelCapability][];
      };
      if (!parsed?.byId) return undefined;
      return { byId: new Map(parsed.byId), byBase: new Map(parsed.byBase ?? []), fetchedAt: parsed.fetchedAt };
    } catch {
      return undefined;
    }
  }

  private writeCache(index: ModelsDevIndex): void {
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      writeFileSync(
        this.cachePath,
        JSON.stringify({ fetchedAt: index.fetchedAt, byId: [...index.byId.entries()], byBase: [...index.byBase.entries()] }),
        "utf8",
      );
    } catch {
      /* cache is best-effort */
    }
  }
}
