/** Diagnostic: for each real axonhub model, show which authoritative source
 *  (pi-ai catalog / models.dev) actually matched, the confidence, and the final
 *  filled capabilities. Highlights models falling back to family-default guesses. */
import { DatabaseSync } from "node:sqlite";
import { matchModel } from "../src/matcher.js";
import { loadPiAiCatalog, lookupCatalog } from "../src/catalog.js";
import { ModelsDevSource } from "../src/modelsdev.js";
import { normalizeId, stripRoutingPrefix } from "../src/protocol.js";
import type { ListingRow } from "../src/types.js";

process.argv[1] = "/opt/dsh/bin/dsh";

const catalog = await loadPiAiCatalog();
const modelsDev = new ModelsDevSource("/root/.dsh/profiles/web/.dsh-model-pilot/modelsdev.json");
await modelsDev.load();
console.log("catalog:", catalog ? `${catalog.modelCount} models` : "UNAVAILABLE");

function readKey(name: string): string | undefined {
  try {
    const db = new DatabaseSync("file:/opt/axonhub/data/axonhub.db?mode=ro", { readOnly: true });
    const row = db.prepare("SELECT key FROM api_keys WHERE name=?").get(name) as { key?: string } | undefined;
    db.close();
    return row?.key;
  } catch { return undefined; }
}

const baseURL = "https://axon.20031014.xyz/v1";
const res = await fetch(baseURL + "/models", { headers: { Authorization: `Bearer ${readKey("completions")}` } });
const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
const listing: ListingRow[] = (json.data ?? []).map((d) => ({ id: String(d.id) }));
console.log("axonhub listing:", listing.length, "models\n");

let guesses = 0;
for (const row of listing) {
  const m = matchModel({ id: row.id, endpoint: row, catalog, modelsDev: (id) => modelsDev.lookup(id), routeProtocol: "openai-completions" });
  const catHits = catalog ? lookupCatalog(catalog, row.id) : [];
  const mdHit = modelsDev.lookup(row.id);
  const cap = m.capability;
  const effortKeys = cap.reasoningEfforts && typeof cap.reasoningEfforts === "object" ? Object.keys(cap.reasoningEfforts).join("/") : String(cap.reasoningEfforts);
  const flag = m.confidence < 0.6 ? "  <<< GUESS (no authoritative match)" : "";
  if (m.confidence < 0.6) guesses++;
  console.log(`${row.id}${flag}`);
  console.log(`   confidence=${m.confidence} sources=[${m.sources.join(",")}] catalogHits=${catHits.length}${catHits.length ? "(" + catHits.slice(0, 3).map((e) => `${e.provider}/${e.id}`).join(", ") + ")" : ""} modelsDev=${mdHit ? "yes" : "no"}`);
  console.log(`   ctx=${cap.contextWindow} maxTok=${cap.maxTokens} input=[${(cap.input ?? []).join(",")}] efforts=${effortKeys} compat=${JSON.stringify(cap.compat)}`);
  console.log(`   norm="${normalizeId(row.id)}" stripped="${stripRoutingPrefix(row.id)}"`);
}
console.log(`\n${guesses}/${listing.length} models fall back to family-default guesses (no authoritative source matched).`);