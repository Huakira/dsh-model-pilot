/**
 * models.dev as the secondary capability source.
 *
 * Fetches https://models.dev/api.json (provider -> models map), caches it to
 * disk with a TTL, and falls back to the stale cache when offline. Only
 * capability facts are read (context/output limits, input modalities, reasoning
 * options) — the `api`/endpoint fields are deliberately ignored so a gateway's
 * baseURL is never overwritten.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeId, stripRoutingPrefix } from "./protocol.js";
import type { ModelCapability, Modality, ReasoningEfforts } from "./types.js";

export const MODELS_DEV_URL = "https://models.dev/api.json";
const DEFAULT_TTL_MS = 24 * 3600 * 1000;

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

export interface ModelsDevIndex {
  byId: Map<string, ModelCapability>;
  fetchedAt: number;
}

function effortsFromOptions(reasoning: boolean | undefined, options: ModelsDevEntry["reasoning_options"]): ReasoningEfforts | false | undefined {
  if (reasoning === false) return false;
  if (!Array.isArray(options)) return undefined;
  const effort = options.find((o) => o?.type === "effort");
  if (effort && Array.isArray(effort.values) && effort.values.length > 0) {
    const out: ReasoningEfforts = { off: null };
    for (const v of effort.values) if (typeof v === "string") out[v] = v;
    return out;
  }
  if (options.some((o) => o?.type === "toggle")) return { off: null, high: "high" };
  return undefined;
}

export function capabilityFromModelsDev(entry: ModelsDevEntry): ModelCapability {
  const cap: ModelCapability = {};
  if (typeof entry.limit?.context === "number" && entry.limit.context > 0) cap.contextWindow = entry.limit.context;
  if (typeof entry.limit?.output === "number" && entry.limit.output > 0) cap.maxTokens = entry.limit.output;
  if (Array.isArray(entry.modalities?.input)) cap.input = entry.modalities.input.filter((m): m is Modality => typeof m === "string") as Modality[];
  const efforts = effortsFromOptions(entry.reasoning, entry.reasoning_options);
  if (efforts !== undefined) cap.reasoningEfforts = efforts;
  return cap;
}

/** Build a cross-provider id index from the parsed api.json document. */
export function buildModelsDevIndex(doc: Record<string, ModelsDevProvider>, fetchedAt: number): ModelsDevIndex {
  const byId = new Map<string, ModelCapability>();
  for (const provider of Object.values(doc)) {
    for (const [modelId, entry] of Object.entries(provider?.models ?? {})) {
      if (!entry || typeof entry !== "object") continue;
      const cap = capabilityFromModelsDev(entry);
      if (Object.keys(cap).length === 0) continue;
      for (const key of new Set([normalizeId(modelId), stripRoutingPrefix(modelId)])) {
        const existing = byId.get(key);
        byId.set(key, existing ? { ...cap, ...existing } : cap);
      }
    }
  }
  return { byId, fetchedAt };
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

  get fetchedAt(): number | undefined {
    return this.index?.fetchedAt;
  }

  private readCache(): ModelsDevIndex | undefined {
    if (!existsSync(this.cachePath)) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(this.cachePath, "utf8")) as { fetchedAt: number; byId: [string, ModelCapability][] };
      if (!parsed?.byId) return undefined;
      return { byId: new Map(parsed.byId), fetchedAt: parsed.fetchedAt };
    } catch {
      return undefined;
    }
  }

  private writeCache(index: ModelsDevIndex): void {
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      writeFileSync(this.cachePath, JSON.stringify({ fetchedAt: index.fetchedAt, byId: [...index.byId.entries()] }), "utf8");
    } catch {
      /* cache is best-effort */
    }
  }
}