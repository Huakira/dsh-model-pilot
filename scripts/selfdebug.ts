/**
 * Self-debug: reproduce the plugin's real add-provider pipeline against the
 * LIVE adapter, then validate the exact payload with the adapter's OWN checks:
 *   1. Config schema (new Config) — modalities / effort keys / compat-key union.
 *   2. resolveRouteModels (extracted verbatim from the installed adapter, with
 *      catalog lookups stubbed empty for custom gateway routes) — per-protocol
 *      compat gating, reasoning-effort rules, positive-integer windows, etc.
 *   3. resolveProfiles route-header checks (copied verbatim).
 * Shows raw payload FAILING and sanitized payload PASSING. Not shipped.
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { matchModel } from "../src/matcher.js";
import { loadPiAiCatalog } from "../src/catalog.js";
import { ModelsDevSource } from "../src/modelsdev.js";
import { routeProtocol } from "../src/protocol.js";
import {
  extractCompatKeys,
  extractInputModalities,
  extractReasoningEffortKeys,
  stripUnknownCompat,
  sanitizeInput,
  sanitizeReasoningEfforts,
  sanitizeCompatByProtocol,
} from "../src/writer.js";
import { loadCompatGates, resolveAdapterLibPath, offeredCompatFields } from "../src/adapter-gates.js";
import type { ProviderRoute, StoredModel, ListingRow } from "../src/types.js";

process.argv[1] = "/opt/dsh/bin/dsh"; // anchor catalog + adapter resolution

const adapterPath = resolveAdapterLibPath();
if (!adapterPath) { console.log("FAIL: cannot resolve adapter lib path"); process.exit(1); }
const adapterSource = readFileSync(adapterPath, "utf8");
const { Config } = (await import(adapterPath)) as { Config: new (raw: unknown) => unknown };
const schema = (Config as unknown as { toJSON(): unknown }).toJSON();

// --- Extract the adapter's REAL validation cluster and run it verbatim. ---
const start = adapterSource.indexOf("const NO_COST");
const end = adapterSource.indexOf("function createModels");
if (start < 0 || end < 0) { console.log("FAIL: cannot locate validation cluster"); process.exit(1); }
const cluster = adapterSource.slice(start, end);
const real = new Function(
  `${cluster}\n` +
  // Custom gateway routes have no installed catalog: stub lookups empty.
  `catalogModels = () => new Map();\n` +
  `catalogProvider = () => undefined;\n` +
  `catalogProviders = () => new Map();\n` +
  `return { resolveRouteModels, COMPAT_GATES, THINKING_LEVELS, MODALITIES };`,
)() as {
  resolveRouteModels: (req: unknown, validation?: string) => { models: unknown[]; modelErrors: Map<string, string> };
  COMPAT_GATES: Record<string, Record<string, string>>;
  THINKING_LEVELS: string[];
  MODALITIES: string[];
};
console.log("real validation cluster extracted:", {
  protocols: Object.keys(real.COMPAT_GATES),
  thinkingLevels: real.THINKING_LEVELS,
  modalities: real.MODALITIES,
});

const gates = loadCompatGates();
const allowedCompat = extractCompatKeys(schema);
const allowedInput = extractInputModalities(schema);
const allowedEfforts = extractReasoningEffortKeys(schema);
console.log("schema gates:", {
  compatKeys: allowedCompat?.size ?? "n/a",
  input: allowedInput ? [...allowedInput] : "n/a",
  effortKeys: allowedEfforts ? [...allowedEfforts] : "n/a",
  perProtocolGates: gates ? Object.keys(gates) : "UNAVAILABLE",
});

const catalog = await loadPiAiCatalog();
console.log("catalog:", catalog ? `${catalog.modelCount} models / ${catalog.providers.length} providers` : "UNAVAILABLE");
const modelsDev = new ModelsDevSource("/root/.dsh/profiles/web/.dsh-model-pilot/modelsdev.json");
const mdStatus = await modelsDev.load();
console.log("models.dev:", mdStatus.source, mdStatus.error ?? "");

function readKey(name: string): string | undefined {
  try {
    const db = new DatabaseSync("file:/opt/axonhub/data/axonhub.db?mode=ro", { readOnly: true });
    const row = db.prepare("SELECT key FROM api_keys WHERE name=?").get(name) as { key?: string } | undefined;
    db.close();
    return row?.key;
  } catch { return undefined; }
}

async function fetchListing(baseURL: string, apiKey?: string): Promise<ListingRow[]> {
  const url = baseURL.replace(/\/+$/, "") + "/models";
  const res = await fetch(url, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
  if (!res.ok) throw new Error(`listing ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
  return (json.data ?? []).map((d) => ({ id: String(d.id), name: typeof d.name === "string" ? d.name : undefined }));
}

function buildModels(route: ProviderRoute, listing: ListingRow[]): StoredModel[] {
  const protocol = routeProtocol(route.api, "");
  return listing.map((row) => {
    const match = matchModel({ id: row.id, endpoint: row, catalog, modelsDev: (id) => modelsDev.lookup(id), routeProtocol: protocol });
    const cap = match.capability;
    return {
      id: row.id,
      name: match.name,
      contextWindow: cap.contextWindow ?? route.defaultContextWindow ?? 131072,
      maxTokens: cap.maxTokens ?? route.defaultMaxTokens ?? 8192,
      input: cap.input ?? route.defaultInput ?? ["text"],
      ...(cap.reasoningEfforts !== undefined ? { reasoningEfforts: cap.reasoningEfforts } : {}),
      ...(cap.compat ? { compat: cap.compat } : {}),
    } as StoredModel;
  });
}

function sanitize(providers: Record<string, ProviderRoute>): Record<string, ProviderRoute> {
  let payload = providers;
  if (allowedCompat) payload = stripUnknownCompat(payload, allowedCompat).providers;
  if (gates) {
    const r = sanitizeCompatByProtocol(payload, gates);
    payload = r.providers;
    if (r.stripped.length) console.log("  stripped compat (per-protocol):", r.stripped.join(", "));
  }
  if (allowedInput) {
    const r = sanitizeInput(payload, allowedInput);
    payload = r.providers;
    if (r.stripped.length) console.log("  stripped input:", r.stripped.join(", "));
  }
  if (allowedEfforts) {
    const r = sanitizeReasoningEfforts(payload, allowedEfforts);
    payload = r.providers;
    if (r.stripped.length) console.log("  stripped effort keys:", r.stripped.join(", "));
  }
  return payload;
}

// resolveProfiles route-header checks (verbatim from adapter lib/index.js:1125-1143).
function assertRouteHeader(provider: string, source: ProviderRoute): void {
  const legacy = source as Record<string, unknown>;
  if ("provider" in legacy) throw new Error(`provider "${provider}" sets "provider", which moved to the providers dict key`);
  if ("maxRetries" in legacy || "maxRetryDelayMs" in legacy) throw new Error(`provider "${provider}" sets removed maxRetries/maxRetryDelayMs`);
  if (provider.length === 0) throw new Error("provider names must be non-empty");
  if (source.baseURL !== undefined && source.baseURL.length === 0) throw new Error(`provider "${provider}" has an empty baseURL`);
  if (source.displayName !== undefined && source.displayName.length === 0) throw new Error(`provider "${provider}" has an empty displayName`);
  for (const [name, value] of Object.entries((source as { headers?: Record<string, string> }).headers ?? {})) new Headers([[name, value]]);
  const defaultInput = [...(source.defaultInput ?? ["text", "image"])];
  if (defaultInput.length === 0) throw new Error(`provider "${provider}" defaultInput must name at least one modality`);
}

function fullValidate(label: string, providers: Record<string, ProviderRoute>): boolean {
  try {
    new Config({ providers }); // schema layer
    for (const [id, route] of Object.entries(providers)) {
      assertRouteHeader(id, route);
      real.resolveRouteModels({
        provider: id,
        ...(route.api !== undefined ? { api: route.api } : {}),
        ...(route.baseURL !== undefined ? { baseURL: route.baseURL } : {}),
        ...(route.models !== undefined ? { models: route.models } : {}),
        ...(route.compat !== undefined ? { compat: route.compat } : {}),
        defaultInput: [...(route.defaultInput ?? ["text", "image"])],
        defaultContextWindow: route.defaultContextWindow ?? 1e6,
        defaultMaxTokens: route.defaultMaxTokens ?? 128e3,
      }, "strict"); // serviceability layer (real adapter logic)
    }
    const n = Object.values(providers).reduce((acc, p) => acc + (p.models?.length ?? 0), 0);
    console.log(`PASS  ${label}: Config + resolveRouteModels accepted ${Object.keys(providers).length} route(s), ${n} models`);
    return true;
  } catch (error) {
    console.log(`FAIL  ${label}:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

const targets: Array<{ id: string; baseURL: string; keyName?: string }> = [
  { id: "axonhub", baseURL: "https://axon.20031014.xyz/v1", keyName: "completions" },
];

let allPass = true;
const combined: Record<string, ProviderRoute> = {};
for (const t of targets) {
  console.log(`\n=== ${t.id} (${t.baseURL}) ===`);
  let listing: ListingRow[];
  try {
    listing = await fetchListing(t.baseURL, t.keyName ? readKey(t.keyName) : undefined);
  } catch (error) {
    console.log("  listing failed:", error instanceof Error ? error.message : String(error));
    allPass = false;
    continue;
  }
  console.log("  listing:", listing.length, "models");
  const route: ProviderRoute = { displayName: t.id, api: "openai-completions", baseURL: t.baseURL, apiKeyEnv: "COMPLETIONS_API_KEY" };
  route.models = buildModels(route, listing);

  // Diagnostic: which models carry compat fields the route protocol does NOT offer?
  const offered = gates ? offeredCompatFields(gates, route.api ?? "openai-completions") : undefined;
  const offCompat = route.models.filter((m) => m.compat && Object.keys(m.compat).some((k) => offered && !offered.has(k)));
  console.log("  models with off-protocol compat (pre-sanitize):", offCompat.length);
  for (const m of offCompat) {
    const bad = Object.keys(m.compat ?? {}).filter((k) => offered && !offered.has(k));
    console.log(`    ${m.id}: off=[${bad.join(",")}] full=${JSON.stringify(m.compat)}`);
  }
  const minimax = route.models.find((m) => m.id.includes("minimax"));
  console.log("  minimax sample:", minimax ? `${minimax.id} compat=${JSON.stringify(minimax.compat)} efforts=${JSON.stringify(minimax.reasoningEfforts)}` : "none in listing");

  console.log("  -- raw payload (pre-sanitize), expect FAIL reproducing the user error --");
  fullValidate(`${t.id} RAW`, { [t.id]: route });

  console.log("  -- sanitized payload, expect PASS --");
  const cleaned = sanitize({ [t.id]: route });
  const ok = fullValidate(`${t.id} CLEAN`, cleaned);
  allPass = allPass && ok;
  Object.assign(combined, cleaned);
}

console.log("\n=== synthetic reproduction of the forceAdaptiveThinking error ===");
// A minimax catalog entry carries anthropic-only forceAdaptiveThinking; on an
// openai-completions route the real adapter must reject it, and the per-protocol
// gate must strip it so the write succeeds.
const synthRoute: ProviderRoute = {
  displayName: "synthetic", api: "openai-completions", baseURL: "https://x/v1", apiKeyEnv: "K",
  models: [{
    id: "minimax-m3.1-flash", name: "MiniMax-M3.1-Flash", contextWindow: 1000000, maxTokens: 512000,
    input: ["text"], reasoningEfforts: { off: null, high: "high" },
    compat: { forceAdaptiveThinking: true, thinkingFormat: "deepseek", supportsReasoningEffort: true },
  } as StoredModel],
};
console.log("  -- raw (expect the exact user error) --");
fullValidate("synthetic RAW", { synthetic: synthRoute });
console.log("  -- sanitized (expect PASS) --");
const synthClean = sanitize({ synthetic: synthRoute });
allPass = fullValidate("synthetic CLEAN", synthClean) && allPass;

console.log("\n=== combined write (all routes at once) ===");
allPass = fullValidate("combined CLEAN", combined) && allPass;
console.log(allPass ? "\nALL PASS (sanitized payload accepted by the real adapter)" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);