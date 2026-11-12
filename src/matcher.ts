/**
 * Capability matcher: combine the pi-ai catalog, models.dev, the upstream
 * listing, and family defaults into one capability set per model id, with a
 * confidence score and source attribution. Higher-priority sources overlay
 * lower ones field by field. Endpoints/baseURLs are never touched here.
 */
import {
  capabilityFromEntry,
  lookupCatalog,
  type CatalogIndex,
} from "./catalog.js";
import { normalizeId, stripRoutingPrefix } from "./protocol.js";
import {
  compatFor,
  defaultEfforts,
  familyOf,
  suggestProtocol,
  baseModelId,
} from "./protocol.js";
import type {
  CapabilitySource,
  ListingRow,
  MatchResult,
  ModelCapability,
  Modality,
  Protocol,
} from "./types.js";

export interface MatchInputs {
  id: string;
  /** Row from the upstream listing (id is authoritative; caps may be sparse). */
  endpoint?: ListingRow;
  catalog?: CatalogIndex;
  /** Optional models.dev capability lookup (primary source — kept freshest). */
  modelsDev?: (id: string) => ModelCapability | undefined;
  /** Optional models.dev base-id fallback lookup (receives the raw model id). */
  modelsDevBase?: (id: string) => ModelCapability | undefined;
  /** Route protocol; when set it is authoritative over the family suggestion. */
  routeProtocol?: Protocol;
}

const SOURCE_CONFIDENCE: Record<CapabilitySource, number> = {
  "pi-ai-catalog": 0.85,
  "models.dev": 0.95,
  endpoint: 0.4,
  "family-default": 0.3,
};

/** Merge `over` onto `under`, field by field; undefined fields keep the base. */
function overlay(under: ModelCapability, over: ModelCapability): ModelCapability {
  const out: ModelCapability = { ...under };
  if (over.contextWindow !== undefined) out.contextWindow = over.contextWindow;
  if (over.maxTokens !== undefined) out.maxTokens = over.maxTokens;
  if (over.input !== undefined) out.input = over.input;
  if (over.reasoningEfforts !== undefined) out.reasoningEfforts = over.reasoningEfforts;
  if (over.compat !== undefined) out.compat = { ...under.compat, ...over.compat };
  return out;
}

export function matchModel(inputs: MatchInputs): MatchResult {
  const { id, endpoint, catalog, modelsDev, modelsDevBase, routeProtocol } = inputs;
  const protocol = routeProtocol ?? suggestProtocol(id);
  const sources: CapabilitySource[] = [];
  const matchedProviders: string[] = [];

  // 1. Family defaults (lowest priority base).
  let cap: ModelCapability = {
    input: ["text"] as Modality[],
    reasoningEfforts: defaultEfforts(id),
    compat: compatFor(id, protocol),
  };
  sources.push("family-default");

  // 2. Endpoint listing (authoritative id; sparse caps).
  if (endpoint) {
    const epCap: ModelCapability = {};
    if (endpoint.contextWindow !== undefined) epCap.contextWindow = endpoint.contextWindow;
    if (endpoint.maxTokens !== undefined) epCap.maxTokens = endpoint.maxTokens;
    if (endpoint.inputModalities && endpoint.inputModalities.length > 0) epCap.input = endpoint.inputModalities;
    if (Object.keys(epCap).length > 0) {
      cap = overlay(cap, epCap);
      sources.push("endpoint");
    }
  }

  // 3. pi-ai catalog (secondary: static, can lag on recent releases).
  let baseIdUsed: string | undefined;
  if (catalog) {
    let entries = lookupCatalog(catalog, id);
    if (entries.length === 0) {
      // Gateway rename (vendor prefix / routing tag / variant suffix): retry on
      // the base model id so renamed real models still land on official data.
      const base = baseModelId(id);
      if (base !== normalizeId(id) && base !== stripRoutingPrefix(id)) {
        const baseEntries = catalog.byBase.get(base) ?? [];
        if (baseEntries.length > 0) { entries = baseEntries; baseIdUsed = base; }
      }
    }
    if (entries.length > 0) {
      let catalogCap: ModelCapability = {};
      for (const entry of entries) {
        catalogCap = overlay(catalogCap, capabilityFromEntry(entry));
        if (entry.provider && !matchedProviders.includes(entry.provider)) matchedProviders.push(entry.provider);
      }
      // Catalog compat must NOT clobber the family-derived thinkingFormat:
      // the catalog matches on the model id across ALL providers, so a
      // third-party hosting variant (e.g. qwen-token-plan/deepseek-*) would
      // stamp its own wire format (qwen) onto a model whose family speaks a
      // different one (deepseek). The family-derived format describes the
      // model itself; the catalog's describes that provider's adapter, which
      // is not the adapter this route uses.
      if (catalogCap.compat) delete catalogCap.compat.thinkingFormat;
      cap = overlay(cap, catalogCap);
      sources.push("pi-ai-catalog");
    }
  }

  // 4. models.dev (primary: continuously updated, majority-voted). Overlay on
  //    top of catalog so fresher data wins field by field.
  if (modelsDev) {
    const md = modelsDev(id);
    if (md && Object.keys(md).length > 0) {
      cap = overlaySanitized(cap, md);
      sources.push("models.dev");
    } else if (modelsDevBase) {
      const base = baseModelId(id);
      if (base !== normalizeId(id) && base !== stripRoutingPrefix(id)) {
        const mdBase = modelsDevBase(id);
        if (mdBase && Object.keys(mdBase).length > 0) {
          cap = overlaySanitized(cap, mdBase);
          sources.push("models.dev");
          if (!baseIdUsed) baseIdUsed = base;
        }
      }
    }
  }

/**
 * Overlay a models.dev capability, but distrust a maxTokens that equals (or
 * exceeds) the context window: several models.dev aggregators copy the
 * context size into limit.output (e.g. deepseek-v4.1-flash-1017 lists
 * 1048576/1048576), which would hand the adapter a bogus output budget and
 * turn a model loop into a very long fuse. Dropping it keeps the
 * lower-priority catalog/route value instead.
 */
function overlaySanitized(under: ModelCapability, over: ModelCapability): ModelCapability {
  const md = { ...over };
  const ctx = md.contextWindow ?? under.contextWindow;
  if (md.maxTokens !== undefined && ctx !== undefined && md.maxTokens >= ctx) {
    delete md.maxTokens;
  }
  return overlay(under, md);
}

  // Confidence = the best source that contributed, capped by agreement.
  const confidence = sources.reduce((best, s) => Math.max(best, SOURCE_CONFIDENCE[s]), 0);

  const name = endpoint?.name ?? catalogName(catalog, id) ?? id;
  return {
    id,
    name,
    capability: cap,
    confidence,
    sources,
    matchedProviders,
    suggestedProtocol: suggestProtocol(id),
    baseIdUsed,
  };
}

function catalogName(catalog: CatalogIndex | undefined, id: string): string | undefined {
  if (!catalog) return undefined;
  const entries = lookupCatalog(catalog, id);
  return entries.find((e) => typeof e.name === "string")?.name;
}

/** Whether a match is strong enough to write without user review. */
export function isConfident(result: MatchResult, threshold = 0.6): boolean {
  return result.confidence >= threshold;
}

export { familyOf };