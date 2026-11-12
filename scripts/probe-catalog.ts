import { loadPiAiCatalog, lookupCatalog } from "../src/catalog.js";
process.argv[1] = "/opt/dsh/bin/dsh";
const catalog = await loadPiAiCatalog();
if (!catalog) { console.log("no catalog"); process.exit(1); }
const candidates = [
  "qwen-4-max-preview", "qwen-4-max", "qwen4-max", "qwen-max", "qwen3-max",
  "glm-5.3-flash-uncensored", "glm-5.3-flash", "glm-5.3-flash:fast",
  "dots-3-note-preview", "dots-3-note", "dots-3",
  "longcat-2.5", "longcat-2", "longcat",
  "kimi-k2.8-preview", "kimi-k2.8", "kimi-k2",
];
for (const id of candidates) {
  const hits = lookupCatalog(catalog, id);
  console.log(`${id.padEnd(28)} -> ${hits.length ? hits.slice(0, 4).map((e) => `${e.provider}/${e.id}(ctx=${e.contextWindow},out=${e.maxTokens})`).join(" | ") : "NO MATCH"}`);
}
// Also list catalog ids containing key families to see what bases exist.
console.log("\n-- catalog ids containing 'qwen-4' / 'qwen4' / 'longcat' / 'dots' --");
const all = [...catalog.byId.keys()];
for (const fam of ["qwen-4", "qwen4", "longcat", "dots", "kimi-k2"]) {
  console.log(fam + ":", all.filter((k) => k.includes(fam)).slice(0, 12).join(", ") || "(none)");
}