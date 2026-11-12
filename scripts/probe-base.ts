import { loadPiAiCatalog } from "../src/catalog.js";
process.argv[1] = "/opt/dsh/bin/dsh";
const catalog = await loadPiAiCatalog();
if (!catalog) { console.log("no catalog"); process.exit(1); }

// Prototype normalization: strip any provider/ prefix, then routing/variant suffixes.
function base(id: string): string {
  let s = id.toLowerCase().trim();
  const slash = s.lastIndexOf("/");
  if (slash >= 0) s = s.slice(slash + 1);
  const colon = s.indexOf(":");
  if (colon >= 0) s = s.slice(0, colon);
  for (const suf of ["-uncensored", "-preview", "-latest", "-free", "-fast", "-slow"]) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s;
}

// Rebuild a base-keyed index from the catalog.
const baseIndex = new Map<string, string[]>();
for (const [key, entries] of catalog.byId) {
  const b = base(key);
  const arr = baseIndex.get(b) ?? [];
  for (const e of entries) arr.push(`${e.provider}/${e.id}`);
  baseIndex.set(b, arr);
}

const guesses = ["longcat-2.5", "qwen-4-max-preview", "glm-5.3-flash-uncensored", "dots-3-note-preview", "glm-5.3-flash:fast", "kimi-k2.8-preview"];
for (const id of guesses) {
  const b = base(id);
  const hits = baseIndex.get(b) ?? [];
  console.log(`${id.padEnd(26)} base="${b}" -> ${hits.length ? [...new Set(hits)].slice(0, 4).join(" | ") : "NO MATCH"}`);
}
console.log("\n-- catalog qwen ids (sample) --");
console.log([...catalog.byId.keys()].filter((k) => k.includes("qwen")).slice(0, 25).join(", "));