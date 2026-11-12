/**
 * The pi-ai installed catalog as the primary capability source.
 *
 * We resolve `@earendil-works/pi-ai/providers/all` from the *installed*
 * dsh-llm-pi-ai adapter's own node_modules so the catalog always matches the
 * adapter version actually serving requests (no bundled-copy drift). The
 * resolver is injectable so the matcher can be unit-tested with fixtures.
 */
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeId, stripRoutingPrefix } from "./protocol.js";
import type { Modality, ModelCapability, ReasoningEfforts } from "./types.js";

/** One catalog entry, structural subset of pi-ai's Model shape. */
export interface CatalogEntry {
  id: string;
  name?: string;
  api?: string;
  baseUrl?: string;
  provider?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
  thinkingLevelMap?: Record<string, string | null>;
  type?: string;
}

export interface CatalogIndex {
  /** normalized id -> entries across providers, in catalog order. */
  byId: Map<string, CatalogEntry[]>;
  providers: string[];
  modelCount: number;
  generatedAt?: number;
}

/** Pluggable catalog loader (real pi-ai in production, fixtures in tests). */
export interface CatalogLoader {
  providers(): string[];
  models(provider: string): CatalogEntry[];
  generatedAt?(): number | undefined;
}

/** Build a cross-provider id index from a loader. */
export function buildCatalogIndex(loader: CatalogLoader): CatalogIndex {
  const byId = new Map<string, CatalogEntry[]>();
  const providers = loader.providers();
  let modelCount = 0;
  for (const provider of providers) {
    let models: CatalogEntry[] = [];
    try {
      models = loader.models(provider);
    } catch {
      continue;
    }
    for (const model of models) {
      if (!model || typeof model.id !== "string" || model.type === "image" || model.type === "classifier") continue;
      modelCount++;
      const entry: CatalogEntry = { ...model, provider: model.provider ?? provider };
      // Index by both the full id and the routing-prefix-stripped id so a
      // gateway alias (auto/…) still lands on the canonical catalog entry.
      for (const key of new Set([normalizeId(entry.id), stripRoutingPrefix(entry.id)])) {
        const list = byId.get(key);
        if (list) list.push(entry);
        else byId.set(key, [entry]);
      }
    }
  }
  return { byId, providers, modelCount, generatedAt: loader.generatedAt?.() };
}

/** Look up entries for a model id (exact normalized, then prefix-stripped). */
export function lookupCatalog(index: CatalogIndex, id: string): CatalogEntry[] {
  return index.byId.get(normalizeId(id)) ?? index.byId.get(stripRoutingPrefix(id)) ?? [];
}

/**
 * Convert a catalog thinkingLevelMap into a config reasoningEfforts ladder:
 * keep levels with a concrete wire spelling; keep `off` as null when the model
 * can disable thinking; drop other null (unsupported) levels.
 */
export function effortsFromLevelMap(map: Record<string, string | null> | undefined): ReasoningEfforts | undefined {
  if (!map) return undefined;
  const out: ReasoningEfforts = {};
  for (const [level, wire] of Object.entries(map)) {
    if (typeof wire === "string") out[level] = wire;
    else if (level === "off") out.off = null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Extract the capability facts we care about from one catalog entry. */
export function capabilityFromEntry(entry: CatalogEntry): ModelCapability {
  const cap: ModelCapability = {};
  if (typeof entry.contextWindow === "number") cap.contextWindow = entry.contextWindow;
  if (typeof entry.maxTokens === "number") cap.maxTokens = entry.maxTokens;
  if (Array.isArray(entry.input)) cap.input = entry.input.filter((m): m is Modality => typeof m === "string") as Modality[];
  const efforts = effortsFromLevelMap(entry.thinkingLevelMap);
  if (efforts) cap.reasoningEfforts = efforts;
  else if (entry.reasoning === false) cap.reasoningEfforts = false;
  if (entry.compat && typeof entry.compat === "object") {
    // Carry only the compat fields relevant to capability matching; the writer
    // re-derives protocol-specific compat and strips unknown keys.
    const c = entry.compat as Record<string, unknown>;
    const compat: Record<string, unknown> = {};
    for (const key of ["thinkingFormat", "requiresReasoningContentOnAssistantMessages", "forceAdaptiveThinking", "maxTokensField"]) {
      if (c[key] !== undefined) compat[key] = c[key];
    }
    if (Object.keys(compat).length > 0) cap.compat = compat;
  }
  return cap;
}

/**
 * Resolve the installed pi-ai catalog module path. Returns undefined when the
 * adapter or its catalog cannot be located (caller falls back to other sources).
 */
export function resolvePiAiCatalogPath(): string | undefined {
  const candidates: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    // Resolve the adapter, then pi-ai from the adapter's own resolution root so
    // the catalog matches the adapter version actually serving requests.
    const adapterPath = require.resolve("@deepseek-ai/dsh-llm-pi-ai");
    const adapterRequire = createRequire(adapterPath);
    candidates.push(adapterRequire.resolve("@earendil-works/pi-ai/providers/all"));
  } catch {
    /* fall through to directory probes */
  }
  // Portable fallback probes (the adapter resolution above is the normal path):
  // the global npm prefix derived from the running node binary, and every DSH
  // profile's node_modules under DSH_HOME (or ~/.dsh).
  const roots: string[] = [];
  const globalRoot = join(dirname(process.execPath), "..", "lib", "node_modules");
  roots.push(join(globalRoot, "@deepseek-ai", "dsh", "node_modules"));
  roots.push(globalRoot);
  const dshHome = process.env.DSH_HOME ?? join(process.env.HOME ?? "~", ".dsh");
  const profilesDir = join(dshHome, "profiles");
  try {
    for (const profile of readdirSync(profilesDir)) roots.push(join(profilesDir, profile, "node_modules"));
  } catch {
    /* no profiles directory */
  }
  for (const root of roots) {
    candidates.push(join(root, "@earendil-works/pi-ai/dist/providers/all.js"));
    candidates.push(join(root, "@deepseek-ai/dsh-llm-pi-ai/node_modules/@earendil-works/pi-ai/dist/providers/all.js"));
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Async convenience: resolve + import + index the installed pi-ai catalog. */
export async function loadPiAiCatalog(): Promise<CatalogIndex | undefined> {
  const path = resolvePiAiCatalogPath();
  if (!path) return undefined;
  try {
    const mod = (await import(path)) as {
      getBuiltinProviders(): string[];
      getBuiltinModels(provider: string): CatalogEntry[];
      getBuiltinModelDataGeneratedAt?(): number | undefined;
    };
    const loader: CatalogLoader = {
      providers: () => mod.getBuiltinProviders(),
      models: (p) => mod.getBuiltinModels(p),
      generatedAt: () => mod.getBuiltinModelDataGeneratedAt?.(),
    };
    return buildCatalogIndex(loader);
  } catch {
    return undefined;
  }
}