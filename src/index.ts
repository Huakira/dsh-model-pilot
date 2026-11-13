/**
 * dsh-model-pilot host half.
 *
 * Adds smart model configuration on top of the official llm-pi-ai provider
 * routes: pull an upstream model list, match capabilities from the pi-ai
 * catalog (then models.dev, then family defaults), and silently write the
 * result into llm-pi-ai.providers.<route> via the settings service. Everything
 * is adjustable from a standalone settings page; writes are backed up and
 * reversible. Endpoints/baseURLs are never rewritten by capability matching.
 */
import Schema from "@deepseek-ai/schemastery";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { loadPiAiCatalog, type CatalogIndex } from "./catalog.js";
import { matchModel } from "./matcher.js";
import { routeProtocol, compatFor, normalizeRules, protocolByRules, DEFAULT_PROTOCOL_RULES } from "./protocol.js";
import { planProtocolSplit, shardRoute } from "./split.js";
import { Writer, readProviders, extractSupportedProtocols, PI_AI_NS } from "./writer.js";
import { fetchGeminiListing, probeModel, probeProtocolEndpoint, GEMINI_DEFAULT_INPUT } from "./fetchers.js";
import { ModelsDevSource } from "./modelsdev.js";
import {
  DEFAULT_OPTIONS,
  type ListingRow,
  type PilotOptions,
  type Protocol,
  type ProviderRoute,
  type StoredModel,
  type ModelCapability,
  type MatchInfo,
  type MatchInfoMap,
  type CredentialsSeam,
  type LlmSeam,
  type SettingsSeam,
} from "./types.js";

export const name = "dsh-model-pilot";
export const inject = ["settings", "llm", "credentials", "connection"];

const API_BASE = "/api/dsh-model-pilot";
const FALLBACK_CONTEXT_WINDOW = 131072;
const FALLBACK_MAX_TOKENS = 8192;

export const Config = Schema.object({
  managedRoutes: Schema.array(Schema.string()).default([]),
  probeEnabled: Schema.boolean().default(false),
  deleteSync: Schema.boolean().default(true),
  autoRefresh: Schema.boolean().default(false),
  refreshIntervalHours: Schema.natural().min(1).default(24),
  backupKeep: Schema.natural().min(1).default(10),
  autoProtocolSplit: Schema.boolean().default(true),
  protocolRules: Schema.object({
    responses: Schema.array(Schema.string()).default([...DEFAULT_PROTOCOL_RULES.responses]),
    anthropic: Schema.array(Schema.string()).default([...DEFAULT_PROTOCOL_RULES.anthropic]),
  }).default({ ...DEFAULT_PROTOCOL_RULES }),
});

interface PilotConfig {
  managedRoutes: string[];
  probeEnabled: boolean;
  deleteSync: boolean;
  autoRefresh: boolean;
  refreshIntervalHours: number;
  backupKeep: number;
  autoProtocolSplit: boolean;
  protocolRules?: { responses?: string[]; anthropic?: string[] };
}

/** Minimal connection fetch seam (structural). */
interface ConnectionSeam {
  fetch: {
    register(route: {
      path: string;
      methods: readonly ("GET" | "HEAD" | "POST")[];
      requestBody: "buffered" | "streaming";
      fetch: (request: Request) => Promise<Response>;
    }): () => void;
  };
}

interface SeamReport {
  settings: boolean;
  llmDiscovery: boolean;
  credentials: boolean;
  connectionFetch: boolean;
  catalog: boolean;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function apply(ctx: any, config: PilotConfig = {} as PilotConfig): void {
  const options: PilotOptions = {
    ...DEFAULT_OPTIONS,
    managedRoutes: config.managedRoutes ?? [],
    probeEnabled: config.probeEnabled ?? false,
    deleteSync: config.deleteSync ?? true,
    autoRefresh: config.autoRefresh ?? false,
    refreshIntervalHours: config.refreshIntervalHours ?? 24,
    backupKeep: config.backupKeep ?? 10,
    autoProtocolSplit: config.autoProtocolSplit ?? true,
    protocolRules: normalizeRules(config.protocolRules),
  };

  const settings = ctx.settings as SettingsSeam | undefined;
  const llm = ctx.llm as LlmSeam | undefined;
  const credentials = ctx.credentials as CredentialsSeam | undefined;
  const connection = ctx.connection as ConnectionSeam | undefined;

  const seams: SeamReport = {
    settings: typeof settings?.update === "function" && typeof settings?.describe === "function",
    llmDiscovery: typeof llm?.discoverModels === "function",
    credentials: typeof credentials?.resolve === "function",
    connectionFetch: typeof connection?.fetch?.register === "function",
    catalog: false,
  };

  const log = (msg: string) => ctx.logger?.info?.(`[dsh-model-pilot] ${msg}`) ?? console.log(`[dsh-model-pilot] ${msg}`);
  const warn = (msg: string) => ctx.logger?.warn?.(`[dsh-model-pilot] ${msg}`) ?? console.warn(`[dsh-model-pilot] ${msg}`);

  // State directory next to the profile patch document.
  let stateDir = join(process.env.DSH_HOME ?? join(process.env.HOME ?? ".", ".dsh"), "storages", "dsh-model-pilot");
  try {
    const docPath = (settings as any)?.documentPath;
    if (typeof docPath === "string" && docPath.length > 0) stateDir = join(dirname(docPath), ".dsh-model-pilot");
  } catch {
    /* keep default */
  }
  mkdirSync(stateDir, { recursive: true });
  const overridesPath = join(stateDir, "overrides.json");
  const metaPath = join(stateDir, "state.json");
  const matchInfoPath = join(stateDir, "matchinfo.json");

  const writer = new Writer(settings as SettingsSeam, {
    backupPath: join(stateDir, "backups.json"),
    backupKeep: options.backupKeep,
    log,
  });

  let catalog: CatalogIndex | undefined;
  let catalogError: string | undefined;
  let supportedProtocols: string[] | undefined;
  const modelsDev = new ModelsDevSource(join(stateDir, "modelsdev-cache.json"));
  let modelsDevStatus: { ok: boolean; source: string; error?: string } = { ok: false, source: "none" };

  const sourcesReady = (async () => {
    try {
      catalog = await loadPiAiCatalog();
      seams.catalog = catalog !== undefined;
      if (catalog) log(`pi-ai catalog loaded: ${catalog.modelCount} models across ${catalog.providers.length} providers`);
      else warn("pi-ai catalog unavailable; falling back to models.dev + family defaults");
    } catch (error) {
      catalogError = String(error);
      warn(`catalog load failed: ${catalogError}`);
    }
    // Detect the protocols the installed adapter accepts (version gating).
    try {
      const descriptor = settings?.describe().find((d) => d.ns === PI_AI_NS);
      supportedProtocols = extractSupportedProtocols(descriptor?.schema);
      if (supportedProtocols) log(`adapter protocols: ${supportedProtocols.join(", ")}`);
    } catch {
      /* leave undefined; UI offers the known set */
    }
    modelsDevStatus = await modelsDev.load();
    if (modelsDevStatus.ok) log(`models.dev ready (${modelsDevStatus.source})`);
    else warn(`models.dev unavailable: ${modelsDevStatus.error ?? "unknown"}`);
  })();
  const catalogReady = sourcesReady;

  // ---- persisted per-model overrides & metadata ---------------------------
  const loadOverrides = (): Record<string, ModelCapability> => {
    if (!existsSync(overridesPath)) return {};
    try {
      return JSON.parse(readFileSync(overridesPath, "utf8")) as Record<string, ModelCapability>;
    } catch {
      return {};
    }
  };
  const saveOverrides = (map: Record<string, ModelCapability>): void => {
    writeFileSync(overridesPath, JSON.stringify(map, null, 2), "utf8");
  };
  // Per-model match attribution (source + confidence) for the UI.
  const loadMatchInfo = (): MatchInfoMap => {
    if (!existsSync(matchInfoPath)) return {};
    try {
      return JSON.parse(readFileSync(matchInfoPath, "utf8")) as MatchInfoMap;
    } catch {
      return {};
    }
  };
  const saveMatchInfo = (map: MatchInfoMap): void => {
    writeFileSync(matchInfoPath, JSON.stringify(map, null, 2), "utf8");
  };
  const loadMeta = (): Record<string, unknown> => {
    if (!existsSync(metaPath)) return {};
    try {
      return JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const saveMeta = (meta: Record<string, unknown>): void => {
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");
  };

  // ---- refresh orchestration ---------------------------------------------
  async function fetchListing(route: ProviderRoute, apiKey: string | undefined, signal?: AbortSignal): Promise<ListingRow[]> {
    const api = route.api ?? "openai-completions";
    if (api === "gemini") {
      const rows = await fetchGeminiListing(route.baseURL ?? "", apiKey, signal);
      // Gemini listings rarely state modalities; seed the family default so the
      // matcher does not downgrade a vision model to text-only.
      return rows.map((r) => ({ ...r, inputModalities: r.inputModalities ?? GEMINI_DEFAULT_INPUT }));
    }
    if (!llm) throw new Error("llm discovery seam unavailable");
    return llm.discoverModels(PI_AI_NS, { baseURL: route.baseURL, api, apiKey }, signal);
  }

  /**
   * Auto-detect the wire protocol an endpoint speaks by trying its model listing
   * under each supported protocol. openai-completions and openai-responses share
   * the {baseURL}/models listing, so an OpenAI-style endpoint resolves to
   * completions (the common gateway default); anthropic uses a distinct endpoint.
   * Returns the first protocol that yields at least one model.
   */
  async function detectProtocol(
    baseURL: string,
    apiKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<{ api: Protocol; listing: ListingRow[] }> {
    const candidates: Protocol[] = ["openai-completions", "anthropic-messages", "openai-responses"];
    if (supportedProtocols?.includes("gemini")) candidates.push("gemini");
    const tried: string[] = [];
    for (const api of candidates) {
      if (supportedProtocols && !supportedProtocols.includes(api)) continue;
      try {
        const listing = await fetchListing({ baseURL, api } as ProviderRoute, apiKey, signal);
        if (listing.length > 0) return { api, listing };
        tried.push(`${api}: 0 models`);
      } catch (error) {
        tried.push(`${api}: ${String(error instanceof Error ? error.message : error)}`);
      }
    }
    throw new Error(`could not auto-detect protocol for ${baseURL} — ${tried.join("; ") || "no protocols available"}`);
  }

  function buildModels(
    routeId: string,
    route: ProviderRoute,
    listing: ListingRow[],
    overrides: Record<string, ModelCapability>,
  ): { models: StoredModel[]; added: string[]; kept: string[]; matchinfo: Record<string, MatchInfo> } {
    const protocol = routeProtocol(route.api, "");
    const previous = new Map((route.models ?? []).map((m) => [m.id, m]));
    const seen = new Set<string>();
    const models: StoredModel[] = [];
    const added: string[] = [];
    const matchinfo: Record<string, MatchInfo> = {};

    for (const row of listing) {
      seen.add(row.id);
      const match = matchModel({
        id: row.id,
        endpoint: row,
        catalog,
        modelsDev: (mid) => modelsDev.lookup(mid),
        modelsDevBase: (mid) => modelsDev.lookupBase(mid),        routeProtocol: protocol,
      });
      const cap = match.capability;
      matchinfo[row.id] = { sources: match.sources, confidence: match.confidence, baseIdUsed: match.baseIdUsed };
      const model: StoredModel = {
        id: row.id,
        name: match.name,
        contextWindow: cap.contextWindow ?? route.defaultContextWindow ?? FALLBACK_CONTEXT_WINDOW,
        maxTokens: cap.maxTokens ?? route.defaultMaxTokens ?? FALLBACK_MAX_TOKENS,
        input: cap.input ?? route.defaultInput ?? ["text"],
        ...(cap.reasoningEfforts !== undefined ? { reasoningEfforts: cap.reasoningEfforts } : {}),
        ...(cap.compat ? { compat: cap.compat } : {}),
      };
      // Apply user override on top.
      const override = overrides[`${routeId}/${row.id}`];
      if (override) Object.assign(model, override);
      if (!previous.has(row.id)) added.push(row.id);
      models.push(model);
    }

    // Preserve previously-configured models no longer advertised (unless deleteSync).
    const kept: string[] = [];
    if (!options.deleteSync) {
      for (const [id, model] of previous) {
        if (!seen.has(id)) {
          models.push({ ...model, stale: true });
          kept.push(id);
        }
      }
    }
    return { models, added, kept, matchinfo };
  }

  /**
   * Which wire protocols this route's endpoint actually answers. Cached per
   * baseURL for 12h so refresh stays cheap. Splitting a model onto a protocol
   * the gateway does not serve would break a model that currently works.
   */
  async function verifiedProtocols(
    baseURL: string,
    apiKey: string | undefined,
    candidates: string[],
  ): Promise<string[]> {
    const meta = loadMeta();
    const cache = (meta.protocolProbe ?? {}) as Record<string, Record<string, { ok: boolean; at: number }>>;
    const entry = (cache[baseURL] ??= {});
    const now = Date.now();
    const out: string[] = [];
    for (const protocol of candidates) {
      const hit = entry[protocol];
      if (hit && now - hit.at < 12 * 60 * 60 * 1000) {
        if (hit.ok) out.push(protocol);
        continue;
      }
      const ok = await probeProtocolEndpoint(protocol as Protocol, baseURL, apiKey).catch(() => false);
      entry[protocol] = { ok, at: now };
      if (ok) out.push(protocol);
    }
    meta.protocolProbe = cache;
    saveMeta(meta);
    return out;
  }

  async function refreshRoutes(routeIds: string[] | undefined, reason: string): Promise<Record<string, unknown>> {
    if (!seams.settings) throw new Error("settings seam unavailable");
    await catalogReady;
    const { providers } = readProviders(settings as SettingsSeam);
    const targets = routeIds && routeIds.length > 0
      ? routeIds
      : options.managedRoutes.length > 0
        ? options.managedRoutes
        : Object.keys(providers);
    const overrides = loadOverrides();
    const next = structuredClone(providers);
    const perRoute: Record<string, unknown> = {};
    const matchinfoAll = loadMatchInfo();
    // Recorded protocol moves live across the whole refresh; load once so one
    // route's plan does not clobber another's.
    const metaState = loadMeta();
    const movesAll = (metaState.moves ?? {}) as Record<string, { to: string; protocol: string; auto?: boolean; pinned?: boolean }>;

    for (const routeId of targets) {
      const route = next[routeId];
      if (!route) {
        perRoute[routeId] = { error: "route not found" };
        continue;
      }
      try {
        const apiKey = route.apiKeyEnv && credentials ? (await credentials.resolve(route.apiKeyEnv))?.value : undefined;
        // Mirror routes (hand-placed protocol shards) are NOT rebuilt from the
        // listing: their models are there precisely because the listing's
        // default protocol was wrong for them. Keep their stored entries.
        if (/-(anthropic-messages|openai-completions|openai-responses|gemini)$/.test(routeId)) {
          perRoute[routeId] = { ok: true, skipped: "mirror route (protocol shard); models are hand-placed" };
          continue;
        }
        const listing = await fetchListing(route, apiKey);
        let { models, added, kept, matchinfo } = buildModels(routeId, route, listing, overrides);
        // Re-apply recorded protocol moves: a moved model must not reappear on
        // the source route even though the listing still advertises it.
        const moves = movesAll;
        const movedOut = Object.entries(moves)
          .filter(([k, v]) => k.startsWith(routeId + "/") && v.to !== routeId && v.auto !== true && !v.pinned)
          .map(([k]) => k.slice(routeId.length + 1));
        if (movedOut.length > 0) {
          const gone = new Set(movedOut);
          models = models.filter((m) => !gone.has(m.id));
          for (const id of movedOut) { delete (matchinfo as Record<string, unknown>)[`${routeId}/${id}`]; }
        }

        // Per-model protocol matching: pi-ai binds one protocol per route, so a
        // model whose family speaks another wire protocol is carried onto a
        // protocol shard "<route>-<protocol>". The shard shares baseURL + key,
        // and meta.moves keeps the model visible on this card.
        if (options.autoProtocolSplit) {
          // Only protocols this endpoint actually serves may receive models.
          const candidates = (supportedProtocols ?? ["openai-completions", "openai-responses", "anthropic-messages"])
            .filter((p) => p !== route.api);
          const verified = candidates.length > 0
            ? await verifiedProtocols(route.baseURL ?? "", apiKey, candidates)
            : [];
          const allowed: string[] = route.api ? [route.api, ...verified] : verified;
          const plan = planProtocolSplit({
            routeId,
            routeApi: route.api,
            models,
            moves,
            supportedProtocols: allowed,
            suggest: (id) => protocolByRules(id, options.protocolRules),
            compatFor,
          });
          models = plan.stay;
          const prevMoves = { ...movesAll };
          for (const key of Object.keys(movesAll)) delete movesAll[key];
          Object.assign(movesAll, plan.moves);
          // A shard model stays only when the user moved it there by hand, or
          // the parent listing does not advertise it (hand-placed in config).
          // Anything the rules used to send here is recomputed from the plan,
          // so a rule change takes models back (0.1.23 fix).
          const listedIds = new Set(listing.map((r) => r.id));
          const keepOnShard = (sid: string, id: string) => {
            const mv = prevMoves[`${routeId}/${id}`];
            if (mv && mv.auto !== true && mv.to === sid) return true;
            return !listedIds.has(id);
          };
          for (const sid of Object.keys(next)) {
            if (!sid.startsWith(`${routeId}-`) || plan.shards[sid]) continue;
            if (!/-(anthropic-messages|openai-completions|openai-responses|gemini)$/.test(sid)) continue;
            const left = (next[sid].models ?? []).filter((m) => keepOnShard(sid, m.id));
            // pi-ai rejects a route with no models: drop an emptied shard.
            if (left.length === 0) delete next[sid];
            else next[sid] = { ...next[sid], models: left };
          }
          for (const [sid, carried] of Object.entries(plan.shards)) {
            const existing = next[sid]?.models ?? [];
            // Keep hand-moved models (moves entry without auto) already there.
            const handMoved = existing.filter((m) => keepOnShard(sid, m.id) && !carried.some((c) => c.id === m.id));
            // A shard inherits the parent route's transport settings (headers,
            // thinkingBudgets, default*, compat, image budgets, …) and only
            // overrides the protocol-scoped fields. Creating a route with a bare
            // 4-field object silently dropped everything else the user had tuned
            // on the parent, and the settings seam replaced the whole section,
            // so the loss was permanent.
            const shard = shardRoute({
              parent: route,
              parentId: routeId,
              shardId: sid,
              protocol: plan.shardProtocols[sid],
              existing: next[sid],
            });
            shard.models = [...handMoved, ...carried];
            next[sid] = shard;
            for (const m of carried) {
              const mi = matchinfo[m.id];
              if (mi) matchinfoAll[sid] = { ...(matchinfoAll[sid] ?? {}), [m.id]: mi };
              delete matchinfo[m.id];
            }
          }
        }

        matchinfoAll[routeId] = matchinfo;
        // Mirror routes (<route>-<protocol>) only carry hand-moved models that
        // the listing may never advertise; do not treat an empty listing as fatal.
        if (models.length === 0 && !catalog?.providers.includes(routeId) && !/-anthropic-messages$|-openai-completions$|-openai-responses$|-gemini$/.test(routeId)) {
          perRoute[routeId] = { error: "listing returned no models; kept previous models (a custom route cannot be empty)" };
          continue;
        }
        route.models = models;
        perRoute[routeId] = { ok: true, listed: listing.length, added: added.length, keptStale: kept.length, models: models.length };
      } catch (error) {
        perRoute[routeId] = { error: String(error instanceof Error ? error.message : error) };
      }
    }

    saveMatchInfo(matchinfoAll);

    const { stripped } = await writer.writeProviders(next, reason);
    const meta = loadMeta();
    meta.lastRefresh = { at: Date.now(), reason, perRoute };
    meta.moves = movesAll;
    saveMeta(meta);
    return { ok: true, perRoute, strippedCompatKeys: stripped };
  }

  // ---- HTTP routes --------------------------------------------------------
  if (!seams.connectionFetch) {
    warn("connection.fetch seam unavailable; settings page backend not registered");
    return;
  }
  const reg = connection!.fetch.register.bind(connection!.fetch);

  const guard = (fn: (request: Request) => Promise<Response>) => async (request: Request): Promise<Response> => {
    try {
      return await fn(request);
    } catch (error) {
      const msg = String(error instanceof Error ? error.message : error);
      warn(`endpoint error (${request.url}): ${msg}`);
      return json({ ok: false, error: msg }, 500);
    }
  };

  reg({
    path: `${API_BASE}/state`,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: guard(async () => {
      await catalogReady;
      const { providers, revision } = seams.settings ? readProviders(settings as SettingsSeam) : { providers: {}, revision: 0 };
      const masked: Record<string, unknown> = {};
      for (const [id, route] of Object.entries(providers)) {
        const keyInfo = route.apiKeyEnv && credentials ? await credentials.describe(route.apiKeyEnv) : undefined;
        masked[id] = {
          displayName: route.displayName,
          api: route.api,
          baseURL: route.baseURL,
          apiKeyEnv: route.apiKeyEnv,
          keyConfigured: keyInfo?.configured ?? false,
          modelCount: (route.models ?? []).length,
          models: route.models ?? [],
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
        matchinfo: loadMatchInfo(),
        backups: writer.listBackups().map((b) => ({ id: b.id, createdAt: b.createdAt, reason: b.reason, routes: Object.keys(b.providers).length })),
        moves: Object.fromEntries(Object.entries((loadMeta().moves ?? {}) as Record<string, { to: string; protocol: string; pinned?: boolean }>).filter(([, v]) => !v.pinned)),
        meta: loadMeta(),
      });
    }),
  });

  reg({
    path: `${API_BASE}/refresh`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const routes = Array.isArray(body.routes) ? (body.routes as string[]) : undefined;
      const result = await refreshRoutes(routes, "manual refresh");
      return json(result);
    }),
  });

  reg({
    path: `${API_BASE}/provider`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const action = (body.action as string) ?? "upsert";
      const id = String(body.id ?? "").trim();
      if (!id) return json({ ok: false, error: "provider id required" }, 400);
      if (!seams.settings) return json({ ok: false, error: "settings seam unavailable" }, 500);
      const { providers } = readProviders(settings as SettingsSeam);
      const next = structuredClone(providers);

      if (action === "remove") {
        delete next[id];
        await writer.writeProviders(next, `remove provider ${id}`);
        return json({ ok: true, removed: id });
      }

      const existing = next[id] ?? {};
      const route: ProviderRoute = { ...existing };
      if (typeof body.displayName === "string") route.displayName = body.displayName;
      if (typeof body.baseURL === "string") route.baseURL = body.baseURL.trim();
      // Key: store in credentials, keep only the ref in the route.
      let apiKeyValue: string | undefined =
        typeof body.apiKey === "string" && body.apiKey.length > 0 ? body.apiKey : undefined;
      if (apiKeyValue) {
        const ref = (typeof body.apiKeyEnv === "string" && body.apiKeyEnv) || route.apiKeyEnv || `DSH_MODEL_PILOT_${id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
        if (!credentials) return json({ ok: false, error: "credentials seam unavailable" }, 500);
        await credentials.set(ref, apiKeyValue);
        route.apiKeyEnv = ref;
      } else if (typeof body.apiKeyEnv === "string") {
        route.apiKeyEnv = body.apiKeyEnv;
      }
      if (!apiKeyValue && route.apiKeyEnv && credentials) {
        apiKeyValue = (await credentials.resolve(route.apiKeyEnv))?.value;
      }
      await catalogReady;

      // Resolve the protocol: an explicit choice, or "auto"/empty → probe the
      // endpoint's listing and adopt whichever protocol answers with models.
      const requestedApi = typeof body.api === "string" && body.api ? body.api : route.api;
      let detected: { api: Protocol; listing: ListingRow[] } | undefined;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      try {
        if (!requestedApi || requestedApi === "auto") {
          if (!route.baseURL) return json({ ok: false, error: "baseURL is required to auto-detect the protocol" }, 400);
          detected = await detectProtocol(route.baseURL, apiKeyValue, controller.signal);
          route.api = detected.api;
        } else {
          route.api = requestedApi as Protocol;
        }
        if (supportedProtocols && !supportedProtocols.includes(route.api)) {
          return json({ ok: false, error: `protocol "${route.api}" is not supported by the installed adapter (offers: ${supportedProtocols.join(", ")})` }, 400);
        }

        // Populate models BEFORE writing: pi-ai rejects an empty custom route
        // ("resolves no models"), so add must fetch the listing in the same step.
        const listing = detected?.listing ?? (await fetchListing(route, apiKeyValue, controller.signal));
        const { models, matchinfo } = buildModels(id, route, listing, loadOverrides());
        if (models.length === 0 && !catalog?.providers.includes(id)) {
          return json({ ok: false, error: "the endpoint returned no models; a custom route must list at least one model (check the baseURL, key and protocol)" }, 400);
        }
        route.models = models;
        const mi = loadMatchInfo();
        mi[id] = matchinfo;
        saveMatchInfo(mi);
        next[id] = route;
        await writer.writeProviders(next, `upsert provider ${id}`);
        // Apply per-model protocol matching to the fresh route (the split needs
        // the matched listing, which we just built).
        let modelCount = models.length;
        if (options.autoProtocolSplit) {
          try {
            const split = await refreshRoutes([id], `auto protocol split after add ${id}`);
            const info = (split.perRoute as Record<string, { models?: number }>)[id];
            if (typeof info?.models === "number") modelCount = info.models;
          } catch (error) {
            warn(`auto protocol split failed for ${id}: ${String(error instanceof Error ? error.message : error)}`);
          }
        }
        return json({ ok: true, id, detectedProtocol: detected?.api, modelCount, route: { ...route, apiKeyEnv: route.apiKeyEnv } });
      } finally {
        clearTimeout(timer);
      }
    }),
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

      // Protocol move: a model the route's protocol does not serve is MOVED to
      // a mirror route "<route>-<protocol>" sharing baseURL + key (pi-ai's
      // resolveEntry ignores a per-model api, so protocol is route-level).
      // The move is recorded in meta.moves so the UI can keep showing the
      // model on its ORIGINAL provider card (with a "→ protocol" chip) —
      // the mirror stays an internal implementation detail, not a new provider.
      const moveTo = typeof body.moveToProtocol === "string" && body.moveToProtocol ? body.moveToProtocol : undefined;
      if (moveTo) {
        if (supportedProtocols && !supportedProtocols.includes(moveTo)) {
          return json({ ok: false, error: `protocol "${moveTo}" is not supported by the installed adapter (offers: ${supportedProtocols.join(", ")})` }, 400);
        }
        if (!seams.settings) return json({ ok: false, error: "settings seam unavailable" }, 500);
        await catalogReady;
        const { providers } = readProviders(settings as SettingsSeam);
        const next = structuredClone(providers);
        const source = next[routeId];
        const model = source?.models?.find((m) => m.id === modelId);
        if (!source || !model) return json({ ok: false, error: `model "${modelId}" not found on route "${routeId}"` }, 400);

        // Moving BACK: the source is a mirror and the target equals the parent
        // route's protocol → merge into the parent, drop the mirror when empty.
        const backMatch = /^(.*)-([a-z-]+)$/.exec(routeId);
        const parentId = backMatch ? backMatch[1] : undefined;
        const parent = parentId ? next[parentId] : undefined;
        if (parentId && parent && parent.api === moveTo) {
          parent.models = [...(parent.models ?? []).filter((m) => m.id !== modelId), { ...model, stale: undefined }];
          next[parentId] = parent;
          source.models = (source.models ?? []).filter((m) => m.id !== modelId);
          if ((source.models ?? []).length === 0) delete next[routeId];
          const mi = loadMatchInfo();
          if (mi[routeId]?.[modelId]) {
            mi[parentId] = { ...(mi[parentId] ?? {}), [modelId]: mi[routeId][modelId] };
            delete mi[routeId][modelId];
            saveMatchInfo(mi);
          }
          const meta = loadMeta();
          const moves = (meta.moves ?? {}) as Record<string, { to: string; protocol: string; auto?: boolean; pinned?: boolean }>;
          // Pin: keep the model on the parent protocol even though its family
          // suggests otherwise; auto-split must not move it again.
          moves[`${parentId}/${modelId}`] = { to: parentId, protocol: parent.api ?? "openai-completions", auto: false, pinned: true };
          meta.moves = moves;
          saveMeta(meta);
          await writer.writeProviders(next, `protocol move-back ${routeId}/${modelId} → ${parentId}`);
          return json({ ok: true, moved: true, from: routeId, to: parentId, model: modelId, mirrorModels: source.models.length, sourceModels: parent.models.length });
        }

        const mirrorId = `${routeId}-${moveTo}`;
        const mirror = shardRoute({
          parent: source,
          parentId: routeId,
          shardId: mirrorId,
          protocol: moveTo as Protocol,
          existing: next[mirrorId],
        });
        // Same wire format? A completions→responses move changes the listing
        // protocol too; models are hand-carried so no re-listing here.
        const stripped = { ...model };
        delete stripped.stale;
        source.models = (source.models ?? []).filter((m) => m.id !== modelId);
        mirror.models = [...(mirror.models ?? []).filter((m) => m.id !== modelId), stripped];
        next[mirrorId] = mirror;
        next[routeId] = source;
        // Move match attribution too, so the badge stays truthful.
        const mi = loadMatchInfo();
        if (mi[routeId]?.[modelId]) {
          mi[mirrorId] = { ...(mi[mirrorId] ?? {}), [modelId]: mi[routeId][modelId] };
          delete mi[routeId][modelId];
          saveMatchInfo(mi);
        }
        // Record the move so the source card keeps listing the model with a
        // "moved to <protocol>" chip and refresh keeps it out of the source.
        const meta = loadMeta();
        const moves = (meta.moves ?? {}) as Record<string, { to: string; protocol: string }>;
        moves[`${routeId}/${modelId}`] = { to: mirrorId, protocol: moveTo };
        meta.moves = moves;
        saveMeta(meta);
        await writer.writeProviders(next, `protocol move ${routeId}/${modelId} → ${mirrorId}`);
        return json({ ok: true, moved: true, from: routeId, to: mirrorId, model: modelId, mirrorModels: mirror.models.length, sourceModels: source.models.length });
      }

      const overrides = loadOverrides();
      const key = `${routeId}/${modelId}`;
      if (body.clear === true) {
        delete overrides[key];
      } else {
        const patch = (body.capability ?? {}) as ModelCapability;
        overrides[key] = { ...overrides[key], ...patch };
      }
      saveOverrides(overrides);
      // Re-apply to the stored model immediately (without a full refresh).
      if (seams.settings) {
        const { providers } = readProviders(settings as SettingsSeam);
        const next = structuredClone(providers);
        const route = next[routeId];
        const model = route?.models?.find((m) => m.id === modelId);
        if (model) {
          if (body.clear === true) {
            // clearing: leave the stored model as-is until next refresh
          } else {
            Object.assign(model, overrides[key]);
          }
          await writer.writeProviders(next, `override ${key}`);
        }
      }
      return json({ ok: true, key, override: overrides[key] ?? null });
    }),
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
    }),
  });

  reg({
    path: `${API_BASE}/options`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      // Persist options into the plugin's own settings namespace.
      const patch: Record<string, unknown> = {};
      for (const key of ["managedRoutes", "probeEnabled", "deleteSync", "autoRefresh", "refreshIntervalHours", "backupKeep", "autoProtocolSplit"] as const) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (body.protocolRules !== undefined) patch.protocolRules = normalizeRules(body.protocolRules);
      if (seams.settings) {
        const descriptor = settings!.describe().find((d) => d.ns === name);
        await settings!.update(name, patch, descriptor?.revision);
      }
      Object.assign(options, patch);
      return json({ ok: true, options });
    }),
  });

  reg({
    path: `${API_BASE}/probe`,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: guard(async (request) => {
      const body = await readBody(request);
      const routeId = String(body.route ?? "");
      if (!seams.settings) return json({ ok: false, error: "settings seam unavailable" }, 500);
      const { providers } = readProviders(settings as SettingsSeam);
      const route = providers[routeId];
      if (!route) return json({ ok: false, error: "route not found" }, 400);
      const modelId = typeof body.model === "string" && body.model ? body.model : (route.models?.[0]?.id ?? "");
      if (!modelId) return json({ ok: false, error: "no model to probe (refresh first or pass model)" }, 400);
      const apiKey = route.apiKeyEnv && credentials ? (await credentials.resolve(route.apiKeyEnv))?.value : undefined;
      const protocol = routeProtocol(route.api, modelId);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const result = await probeModel(protocol, route.baseURL ?? "", modelId, apiKey, controller.signal);
        return json({ ok: true, route: routeId, model: modelId, ...result });
      } finally {
        clearTimeout(timer);
      }
    }),
  });

  // ---- auto refresh timer -------------------------------------------------
  if (options.autoRefresh && seams.settings && seams.llmDiscovery) {
    const intervalMs = options.refreshIntervalHours * 3600 * 1000;
    const timer = setInterval(() => {
      refreshRoutes(undefined, "auto refresh").catch((error) => warn(`auto refresh failed: ${String(error)}`));
    }, intervalMs);
    ctx.effect?.(() => () => clearInterval(timer), "dsh-model-pilot: auto refresh");
  }

  // Log activation after the async sources settle so the reported `catalog`
  // seam reflects the loaded catalog (it is mutated in place by sourcesReady).
  // Logging synchronously here would snapshot catalog:false before the load.
  void sourcesReady
    .catch((error) => warn(`source initialization failed: ${String(error)}`))
    .then(() => log(`host applied (seams: ${JSON.stringify(seams)})`));
}