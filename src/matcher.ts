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
  /** Optional models.dev capability lookup (secondary source). */
  modelsDev?: (id: string) => ModelCapability | undefined;
  /** Route protocol; when set it is authoritative over the family suggestion. */
  routeProtocol?: Protocol;
}

const SOURCE_CONFIDENCE: Record<CapabilitySource, number> = {
  "pi-ai-catalog": 0.9,
  "models.dev": 0.75,
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
  const { id, endpoint, catalog, modelsDev, routeProtocol } = inputs;
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

  // 3. models.dev (secondary).
  if (modelsDev) {
    const md = modelsDev(id);
    if (md && Object.keys(md).length > 0) {
      cap = overlay(cap, md);
      sources.push("models.dev");
    }
  }

  // 4. pi-ai catalog (primary). Merge across providers; first non-undefined wins
  //    per field, but every describing provider is recorded for attribution.
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
      // Catalog compat should not clobber the protocol-specific thinkingFormat
      // we derived for THIS route unless the catalog names one explicitly.
      cap = overlay(cap, catalogCap);
      sources.push("pi-ai-catalog");
    }
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