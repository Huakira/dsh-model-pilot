/**
 * Per-protocol compat gating, read from the INSTALLED adapter source.
 *
 * The adapter (dsh-llm-pi-ai) validates each model.compat field against a
 * per-protocol gate: a field is only accepted on a route whose protocol
 * "offers" it (COMPAT_GATES[api][field] === "offer"). "withhold" fields and
 * fields belonging to another protocol are rejected at write time
 * (resolveRouteModels → resolveModelCompat). The Config schema alone unions
 * every protocol's fields, so schema gating is not enough — e.g.
 * `forceAdaptiveThinking` is anthropic-messages-only and must not be written
 * onto an openai-completions route.
 *
 * These gates are not exported by the adapter, but they are pure data literals
 * in its bundle. We read them straight from the installed adapter so the gate
 * set always matches the running DSH version (same version-consistency principle
 * as the pi-ai catalog resolution). If extraction fails we fall back to the
 * schema-derived union (caller keeps the older, looser behavior).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** protocol -> { compatField: "offer" | "withhold" } */
export type CompatGates = Record<string, Record<string, string>>;

const ADAPTER_PKG = "@deepseek-ai/dsh-llm-pi-ai";

/**
 * Locate the installed adapter bundle (lib/index.js). Mirrors the catalog
 * anchor: the DSH launcher path (process.argv[1]) gives the install prefix, and
 * the adapter lives under the core package's node_modules (or hoisted).
 */
export function resolveAdapterLibPath(): string | undefined {
  const candidates: string[] = [];
  const launcher = process.argv[1];
  if (launcher) {
    // <prefix>/bin/dsh -> <prefix>/lib/node_modules
    const prefix = dirname(dirname(launcher));
    const nm = join(prefix, "lib", "node_modules");
    candidates.push(join(nm, "@deepseek-ai", "dsh", "node_modules", ADAPTER_PKG, "lib", "index.js"));
    candidates.push(join(nm, ADAPTER_PKG, "lib", "index.js"));
  }
  const home = process.env.DSH_HOME;
  if (home) {
    candidates.push(join(home, "node_modules", ADAPTER_PKG, "lib", "index.js"));
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return undefined;
}

/** Extract a balanced `{...}` object literal starting at the first `{` at/after `from`. */
function extractObject(source: string, from: number): { body: string; end: number } | undefined {
  const start = source.indexOf("{", from);
  if (start < 0) return undefined;
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return { body: source.slice(start, i + 1), end: i + 1 };
    }
  }
  return undefined;
}

/**
 * Parse the three gate literals (COMPLETIONS_COMPAT_GATE, RESPONSES_COMPAT_GATE,
 * COMPAT_GATES) out of the adapter source. They are pure string-keyed data; we
 * evaluate just those declarations in an isolated scope. Returns undefined if
 * the expected declarations are not found (format drift).
 */
export function extractCompatGates(source: string): CompatGates | undefined {
  const names = ["COMPLETIONS_COMPAT_GATE", "RESPONSES_COMPAT_GATE", "COMPAT_GATES"];
  const declarations: string[] = [];
  for (const name of names) {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*`);
    const m = re.exec(source);
    if (!m) return undefined;
    const obj = extractObject(source, m.index + m[0].length);
    if (!obj) return undefined;
    declarations.push(`const ${name} = ${obj.body};`);
  }
  try {
    // The declarations are pure object literals (string keys/values and, for
    // COMPAT_GATES, references to the two preceding consts). No side effects.
    const fn = new Function(`${declarations.join("\n")}\nreturn COMPAT_GATES;`);
    const gates = fn() as CompatGates;
    if (!gates || typeof gates !== "object") return undefined;
    // Sanity: every protocol maps to an object of string statuses.
    for (const fields of Object.values(gates)) {
      if (!fields || typeof fields !== "object") return undefined;
      for (const status of Object.values(fields)) {
        if (typeof status !== "string") return undefined;
      }
    }
    return gates;
  } catch {
    return undefined;
  }
}

let cached: CompatGates | undefined | null = null; // null = tried, unavailable

/** Read + parse the installed adapter's gates once (cached). */
export function loadCompatGates(): CompatGates | undefined {
  if (cached !== null) return cached ?? undefined;
  const path = resolveAdapterLibPath();
  if (!path) { cached = null; return undefined; }
  try {
    cached = extractCompatGates(readFileSync(path, "utf8")) ?? null;
  } catch {
    cached = null;
  }
  return cached ?? undefined;
}

/** Fields the given protocol offers (accepts) on a route. */
export function offeredCompatFields(gates: CompatGates, api: string): Set<string> {
  const out = new Set<string>();
  const gate = gates[api];
  if (!gate) return out;
  for (const [field, status] of Object.entries(gate)) {
    if (status === "offer") out.add(field);
  }
  return out;
}

/** Union of fields offered by at least one protocol (schema-level validity). */
export function allOfferedCompatFields(gates: CompatGates): Set<string> {
  const out = new Set<string>();
  for (const gate of Object.values(gates)) {
    for (const [field, status] of Object.entries(gate)) {
      if (status === "offer") out.add(field);
    }
  }
  return out;
}