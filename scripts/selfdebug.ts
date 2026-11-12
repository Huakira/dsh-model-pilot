/**
 * Self-debug: reproduce the plugin's real add-provider pipeline against the
 * LIVE adapter schema and a REAL gateway listing, then validate the exact
 * payload with the adapter's own Config. Run via scripts/run-selfdebug.mjs.
 * Not shipped (scripts/ is outside package files).
 */
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
} from "../src/writer.js";
import type { ProviderRoute, StoredModel, ListingRow } from "../src/types.js";

// Mimic the real DSH runtime so catalog resolution anchors on the launcher.
process.argv[1] = "/opt/dsh/bin/dsh";

const ADAPTER_DIR = "/opt/dsh/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai";
const adapterPath = `${ADAPTER_DIR}/lib/index.js`;
const { Config } = (await import(adapterPath)) as { Config: new (raw: unknown) => unknown };
const schema = (Config as unknown as { toJSON(): unknown }).toJSON();

const allowedCompat = extractCompatKeys(schema);
const allowedInput = extractInputModalities(schema);
const allowedEfforts = extractReasoningEffortKeys(schema);
console.log("schema gates:", {
  compatKeys: allowedCompat ? allowedCompat.size : "n/a",
  input: allowedInput ? [...allowedInput] : "n/a",
  effortKeys: allowedEfforts ? [...allowedEfforts] : "n/a",
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

function buildModels(routeId: string, route: ProviderRoute, listing: ListingRow[]): StoredModel[] {
  const protocol = routeProtocol(route.api, "");
  const models: StoredModel[] = [];
  for (const row of listing) {
    const match = matchModel({ id: row.id, endpoint: row, catalog, modelsDev: (id) => modelsDev.lookup(id), routeProtocol: protocol });
    const cap = match.capability;
    const model: StoredModel = {
      id: row.id,
      name: match.name,
      contextWindow: cap.contextWindow ?? route.defaultContextWindow ?? 131072,
      maxTokens: cap.maxTokens ?? route.defaultMaxTokens ?? 8192,
      input: cap.input ?? route.defaultInput ?? ["text"],
      ...(cap.reasoningEfforts !== undefined ? { reasoningEfforts: cap.reasoningEfforts } : {}),
      ...(cap.compat ? { compat: cap.compat } : {}),
    };
    models.push(model);
  }
  return models;
}

function sanitize(providers: Record<string, ProviderRoute>): Record<string, ProviderRoute> {
  let payload = providers;
  if (allowedCompat) payload = stripUnknownCompat(payload, allowedCompat).providers;
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

function validate(label: string, providers: Record<string, ProviderRoute>): boolean {
  // resolveRouteModels invariants (adapter lib/index.js:657-693): non-empty
  // models for non-catalog routes; each entry needs api + baseURL + positive
  // integer contextWindow/maxTokens.
  for (const [id, p] of Object.entries(providers)) {
    if (!p.api || !p.baseURL) { console.log(`FAIL  ${label}: route ${id} missing api/baseURL`); return false; }
    if (!Array.isArray(p.models) || p.models.length === 0) { console.log(`FAIL  ${label}: route ${id} resolves no models`); return false; }
    for (const m of p.models) {
      for (const f of ["contextWindow", "maxTokens"] as const) {
        const v = m[f];
        if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) { console.log(`FAIL  ${label}: ${id}/${m.id} ${f}=${String(v)} not positive integer`); return false; }
      }
    }
  }
  try {
    new Config({ providers });
    console.log(`PASS  ${label}: Config accepted ${Object.keys(providers).length} route(s), ${Object.values(providers).reduce((n, p) => n + (p.models?.length ?? 0), 0)} models`);
    return true;
  } catch (error) {
    console.log(`FAIL  ${label}:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

const targets: Array<{ id: string; baseURL: string; keyName?: string }> = [
  { id: "axonhub", baseURL: "https://axon.20031014.xyz/v1", keyName: "completions" },
  { id: "magpie", baseURL: "https://magpie.20031014.xyz/v1", keyName: "completions" },
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
    continue;
  }
  console.log("  listing:", listing.length, "models");
  const route: ProviderRoute = { displayName: t.id, api: "openai-completions", baseURL: t.baseURL, apiKeyEnv: "COMPLETIONS_API_KEY" };
  route.models = buildModels(t.id, route, listing);
  // Show a sample of raw reasoningEfforts maps that contain off-schema keys.
  const badEfforts = route.models.filter((m) => m.reasoningEfforts && typeof m.reasoningEfforts === "object" && Object.keys(m.reasoningEfforts).some((k) => allowedEfforts && !allowedEfforts.has(k)));
  console.log("  models with off-schema effort keys (pre-sanitize):", badEfforts.length, badEfforts.slice(0, 3).map((m) => `${m.id}:${Object.keys(m.reasoningEfforts as object).join("/")}`));
  const badInput = route.models.filter((m) => (m.input ?? []).some((x) => allowedInput && !allowedInput.has(x)));
  console.log("  models with off-schema input (pre-sanitize):", badInput.length, badInput.slice(0, 3).map((m) => `${m.id}:${(m.input ?? []).join("/")}`));
  const cleaned = sanitize({ [t.id]: route });
  const ok = validate(t.id, cleaned);
  allPass = allPass && ok;
  Object.assign(combined, cleaned);
}

console.log("\n=== combined write (all routes at once) ===");
allPass = validate("combined", combined) && allPass;
console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");
process.exit(allPass ? 0 : 1);