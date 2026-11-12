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
 * Walk up from a resolved adapter file looking for the pi-ai catalog dist file.
 *
 * pi-ai (>=1.x) is ESM-only: its package `exports` map exposes `.` and
 * `./providers/*` under `import`/`types` conditions only, with no `require` or
 * `default` condition. `createRequire(...).resolve("@earendil-works/pi-ai/...")`
 * therefore throws ERR_PACKAGE_PATH_NOT_EXPORTED even when the package is
 * present. We probe the filesystem directly instead; `loadPiAiCatalog` then
 * `import()`s the concrete dist file (which bypasses the exports map).
 *
 * The catalog may be hoisted into any ancestor `node_modules` (e.g. a sibling
 * of the adapter under the DSH core's node_modules), so check both `dir` and
 * `dir/node_modules` at each level.
 */
function catalogNearAdapter(adapterPath: string): string | undefined {
  let dir = dirname(adapterPath);
  for (let depth = 0; depth < 12; depth++) {
    for (const base of [dir, join(dir, "node_modules")]) {
      const candidate = join(base, "@earendil-works", "pi-ai", "dist", "providers", "all.js");
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Resolve the installed pi-ai catalog module path. Returns undefined when the
 * adapter or its catalog cannot be located (caller falls back to other sources).
 *
 * Anchor order (most reliable first):
 *  1. The DSH install prefix derived from the running launcher script
 *     (`process.argv[1]` = `<prefix>/bin/dsh`). This is independent of where the
 *     node binary lives — on a global install node is often `/usr/bin/node`,
 *     so the execPath-derived prefix would point at the wrong tree.
 *  2. The node-binary-derived global prefix (bundled-runtime layouts).
 *  3. Every DSH profile's node_modules under DSH_HOME (or ~/.dsh).
 *  4. The plugin's own resolution root (dev / unit-test layouts).
 */
export function resolvePiAiCatalogPath(): string | undefined {
  const roots: string[] = [];

  // (1) DSH install prefix from the launcher script path.
  const launchScript = process.argv[1];
  if (launchScript) {
    const installRoot = join(dirname(launchScript), "..", "lib", "node_modules");
    roots.push(join(installRoot, "@deepseek-ai", "dsh", "node_modules"));
    roots.push(installRoot);
  }
  // (2) node-binary-derived global prefix.
  const globalRoot = join(dirname(process.execPath), "..", "lib", "node_modules");
  roots.push(join(globalRoot, "@deepseek-ai", "dsh", "node_modules"));
  roots.push(globalRoot);
  // (3) DSH profile node_modules.
  const dshHome = process.env.DSH_HOME ?? join(process.env.HOME ?? "~", ".dsh");
  const profilesDir = join(dshHome, "profiles");
  try {
    for (const profile of readdirSync(profilesDir)) roots.push(join(profilesDir, profile, "node_modules"));
  } catch {
    /* no profiles directory */
  }

  const candidates: string[] = [];
  const pushRoot = (root: string) => {
    // Direct dist probes for the common hoisted / nested layouts.
    candidates.push(join(root, "@earendil-works", "pi-ai", "dist", "providers", "all.js"));
    candidates.push(join(root, "@deepseek-ai", "dsh", "node_modules", "@earendil-works", "pi-ai", "dist", "providers", "all.js"));
    candidates.push(join(root, "@deepseek-ai", "dsh-llm-pi-ai", "node_modules", "@earendil-works", "pi-ai", "dist", "providers", "all.js"));
    // Adapter-anchored walk: resolve the adapter (its package IS resolvable),
    // then locate the catalog relative to it for version consistency.
    try {
      const r = createRequire(join(root, "package.json"));
      const adapterPath = r.resolve("@deepseek-ai/dsh-llm-pi-ai");
      const near = catalogNearAdapter(adapterPath);
      if (near) candidates.push(near);
    } catch {
      /* adapter not resolvable from this root */
    }
  };
  for (const root of roots) pushRoot(root);

  // (4) The plugin's own resolution root (dev / test where the adapter is a
  // sibling dependency of this package).
  try {
    const require = createRequire(import.meta.url);
    const adapterPath = require.resolve("@deepseek-ai/dsh-llm-pi-ai");
    const near = catalogNearAdapter(adapterPath);
    if (near) candidates.push(near);
  } catch {
    /* not resolvable from the plugin location */
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
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