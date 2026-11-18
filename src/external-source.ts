/**
 * External JSON as a capability source.
 *
 * Some deployments already maintain a hand-curated model/context-window table
 * for a reverse-proxy or compression layer in front of the real provider
 * (e.g. billion-context's `providers.json`: an absolute-URL-keyed map of
 * `{ models: { <modelId>: { context, output } } }`). Those entries exist
 * specifically because the models behind a private gateway carry renamed,
 * non-public ids that neither the pi-ai catalog nor models.dev can recognize
 * — so when that file is available it should outrank both of those guesses
 * for exactly the ids it declares, instead of duplicating the same table a
 * second time inside dsh-model-pilot's own overrides.
 *
 * This loader is intentionally narrow: it only reads `context`/`output` and
 * `reasoningEfforts` per model under a provider URL key, the fields a
 * reverse-proxy table realistically carries. Anything else in the file
 * (compress, renderNone, pinEffort, non-model routing fields, …) is ignored —
 * this is a read-only, best-effort capability hint, never a config merge.
 *
 * `reasoningEfforts` is AxonHub's unified effort vocabulary (llm/reasoning.go:
 * none/minimal/low/medium/high/xhigh/max), written into the shared table by
 * sync_to_modeldata.py. It is the only place a gateway's own knowledge of a
 * model's thinking ladder survives: `/v1/models` does not publish it, so
 * without this the plugin falls back to the universal off+high pair.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import type { ModelCapability, Protocol } from "./types.js";

interface ExternalModelEntry {
  context?: number;
  output?: number;
  /** AxonHub unified effort names; see PI_LEVEL_WIRE. */
  reasoningEfforts?: unknown;
  [key: string]: unknown;
}

/**
 * Pi thinking level -> AxonHub's unified effort spelling. Pi's `off` is
 * AxonHub's `none`; every other level keeps its name. This is the same table
 * AxonHub's own pi-config export uses
 * (frontend/src/features/apikeys/data/pi-models-config.ts), so a gateway card
 * and a dsh refresh agree on the wire values.
 */
const PI_LEVEL_WIRE: Record<string, string> = {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

interface ExternalProviderEntry {
  models?: Record<string, ExternalModelEntry>;
  [key: string]: unknown;
}

type ExternalProvidersFile = Record<string, ExternalProviderEntry>;

/** Strip a trailing slash so "https://x/v1/" and "https://x/v1" compare equal. */
function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * Build the set of absolute URL keys this route's traffic could plausibly be
 * filed under in an external providers.json. The file's keys are the exact
 * wire URL a `/bili/`-style proxy tunnels to, which for an OpenAI-style route
 * is normally `${baseURL}` with a `/v1` suffix, and for an Anthropic-style
 * route is the bare origin plus the Messages path (dsh-model-pilot's own
 * Anthropic shards store baseURL WITHOUT a trailing `/v1` — see
 * docs/compatibility-notes.md — so both the stored value and the `/v1`-
 * stripped form are tried).
 */
function candidateKeys(baseURL: string, protocol: Protocol): string[] {
  const base = trimSlash(baseURL);
  const bareOrigin = base.replace(/\/v1$/, "");
  const out = new Set<string>([base]);
  if (protocol === "anthropic-messages") {
    out.add(bareOrigin);
    out.add(`${bareOrigin}/v1/messages`);
    out.add(`${bareOrigin}/v1/messages?beta=true`);
  } else {
    // openai-completions / openai-responses / gemini: the proxy table is
    // normally keyed by the OpenAI-compatible `/v1` root.
    out.add(base.endsWith("/v1") ? base : `${base}/v1`);
    out.add(bareOrigin);
  }
  return [...out];
}

export class ExternalSource {
  private path: string | undefined;
  private mtimeMs = 0;
  private data: ExternalProvidersFile | undefined;
  private loadError: string | undefined;

  constructor(private readonly log: (msg: string) => void = () => {}) {}

  /** (Re)point the source at a file. Call on every options save. */
  configure(path: string | undefined): void {
    const next = path?.trim() || undefined;
    if (next !== this.path) {
      this.path = next;
      this.mtimeMs = 0;
      this.data = undefined;
      this.loadError = undefined;
    }
  }

  get configuredPath(): string | undefined {
    return this.path;
  }

  get status(): { ok: boolean; path?: string; providerCount?: number; error?: string } {
    if (!this.path) return { ok: false };
    this.ensureLoaded();
    if (this.loadError) return { ok: false, path: this.path, error: this.loadError };
    return { ok: true, path: this.path, providerCount: Object.keys(this.data ?? {}).length };
  }

  private ensureLoaded(): void {
    if (!this.path) return;
    let mtimeMs: number;
    try {
      if (!existsSync(this.path)) throw new Error("file not found");
      mtimeMs = statSync(this.path).mtimeMs;
    } catch (error) {
      this.data = undefined;
      this.loadError = String(error instanceof Error ? error.message : error);
      return;
    }
    if (this.data && mtimeMs === this.mtimeMs) return; // cached, file unchanged
    try {
      const raw = readFileSync(this.path, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") throw new Error("not a JSON object");
      this.data = parsed as ExternalProvidersFile;
      this.mtimeMs = mtimeMs;
      this.loadError = undefined;
      this.log(`external source loaded: ${this.path} (${Object.keys(this.data).length} provider routes)`);
    } catch (error) {
      this.data = undefined;
      this.loadError = String(error instanceof Error ? error.message : error);
      this.log(`external source failed to parse ${this.path}: ${this.loadError}`);
    }
  }

  /** Look up one model's declared capability for a given route. undefined = no entry. */
  lookup(baseURL: string, protocol: Protocol, modelId: string): ModelCapability | undefined {
    if (!this.path || !baseURL) return undefined;
    this.ensureLoaded();
    if (!this.data) return undefined;
    for (const key of candidateKeys(baseURL, protocol)) {
      const entry = this.data[key]?.models?.[modelId];
      if (!entry) continue;
      const cap: ModelCapability = {};
      if (typeof entry.context === "number" && entry.context > 0) cap.contextWindow = entry.context;
      if (typeof entry.output === "number" && entry.output > 0) cap.maxTokens = entry.output;
      // Thinking ladder: a declared level keeps its wire spelling, an
      // undeclared one becomes null (pi hides a null level). The writer drops
      // the nulls again, so the stored config stays sparse.
      const efforts = entry.reasoningEfforts;
      if (Array.isArray(efforts) && efforts.length > 0) {
        const accepted = new Set(
          efforts.filter((e): e is string => typeof e === "string").map((e) => e.toLowerCase()),
        );
        const map: Record<string, string | null> = {};
        for (const [level, wire] of Object.entries(PI_LEVEL_WIRE)) {
          map[level] = accepted.has(wire) ? wire : null;
        }
        cap.reasoningEfforts = map;
      }
      if (Object.keys(cap).length > 0) return cap;
    }
    return undefined;
  }
}
