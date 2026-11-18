import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ExternalSource } from "../src/external-source.js";
import { matchModel } from "../src/matcher.js";

// Realistic sample shaped exactly like a billion-context providers.json: an
// OpenAI-style route (bare /v1), and an Anthropic-style route keyed by the
// full Messages path with a `?beta=true` variant — the three key shapes a
// gateway-fronted deployment actually produces.
const SAMPLE = {
  "https://axon.20031014.xyz/v1": {
    models: {
      "glm-5.3-flash-uncensored": { context: 1048576 },
      "hy3": { context: 262144 },
      "longcat-2.5": { context: 1048576, output: 131072, reasoningEfforts: ["low", "high", "max", "xhigh"] },
    },
  },
  "https://axon.20031014.xyz/v1/messages": {
    renderNone: true,
    pinEffort: true,
    models: {
      "claude-sonnet-5-5": { context: 1000000, output: 64000 },
    },
  },
  "https://axon.20031014.xyz/v1/messages?beta=true": {
    models: {
      "claude-sonnet-5-5": { context: 1000000 },
    },
  },
};

describe("ExternalSource", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dsh-model-pilot-ext-"));
    file = join(dir, "providers.json");
    writeFileSync(file, JSON.stringify(SAMPLE), "utf-8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("is inert until configured with a path", () => {
    const src = new ExternalSource();
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "hy3")).toBeUndefined();
    expect(src.status.ok).toBe(false);
  });

  it("resolves an openai-style model under the bare /v1 key", () => {
    const src = new ExternalSource();
    src.configure(file);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "glm-5.3-flash-uncensored")).toEqual({
      contextWindow: 1048576,
    });
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-responses", "hy3")).toEqual({ contextWindow: 262144 });
  });

  it("resolves an anthropic-style model whose stored baseURL has no trailing /v1", () => {
    const src = new ExternalSource();
    src.configure(file);
    // dsh-model-pilot's Anthropic shards store baseURL WITHOUT /v1.
    expect(src.lookup("https://axon.20031014.xyz", "anthropic-messages", "claude-sonnet-5-5")).toEqual({
      contextWindow: 1000000,
      maxTokens: 64000,
    });
  });

  it("also resolves if the stored baseURL still carries a trailing /v1", () => {
    const src = new ExternalSource();
    src.configure(file);
    expect(src.lookup("https://axon.20031014.xyz/v1", "anthropic-messages", "claude-sonnet-5-5")).toEqual({
      contextWindow: 1000000,
      maxTokens: 64000,
    });
  });

  it("converts AxonHub's unified effort list into a pi level map", () => {
    const src = new ExternalSource();
    src.configure(file);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "longcat-2.5")).toEqual({
      contextWindow: 1048576,
      maxTokens: 131072,
      // `off` maps to AxonHub's `none`; undeclared levels are null (pi hides them).
      reasoningEfforts: {
        off: null,
        minimal: null,
        low: "low",
        medium: null,
        high: "high",
        xhigh: "xhigh",
        max: "max",
      },
    });
  });

  it("ignores a non-array reasoningEfforts field rather than throwing", () => {
    writeFileSync(
      file,
      JSON.stringify({
        "https://axon.20031014.xyz/v1": { models: { hy3: { context: 262144, reasoningEfforts: "low" } } },
      }),
      "utf-8",
    );
    const future = new Date(Date.now() + 5000);
    utimesSync(file, future, future);
    const src = new ExternalSource();
    src.configure(file);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "hy3")).toEqual({ contextWindow: 262144 });
  });

  it("returns undefined for a model the file does not declare", () => {
    const src = new ExternalSource();
    src.configure(file);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "no-such-model")).toBeUndefined();
  });

  it("fails closed (no throw) on a missing file, and reports status.ok=false", () => {
    const src = new ExternalSource();
    src.configure(join(dir, "does-not-exist.json"));
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "hy3")).toBeUndefined();
    expect(src.status.ok).toBe(false);
  });

  it("fails closed (no throw) on malformed JSON", () => {
    const badFile = join(dir, "bad.json");
    writeFileSync(badFile, "{ not json", "utf-8");
    const src = new ExternalSource();
    src.configure(badFile);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "hy3")).toBeUndefined();
    expect(src.status.ok).toBe(false);
  });

  it("re-reads after the file changes (mtime-based cache invalidation)", () => {
    const src = new ExternalSource();
    src.configure(file);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "hy3")).toEqual({ contextWindow: 262144 });
    writeFileSync(
      file,
      JSON.stringify({ "https://axon.20031014.xyz/v1": { models: { hy3: { context: 500000 } } } }),
      "utf-8",
    );
    // Force a distinct mtime: a same-millisecond rewrite can otherwise land on
    // an identical filesystem timestamp, which would make real cache
    // invalidation (correctly) skip the reload — not a bug in the source.
    const future = new Date(Date.now() + 5000);
    utimesSync(file, future, future);
    expect(src.lookup("https://axon.20031014.xyz/v1", "openai-completions", "hy3")).toEqual({ contextWindow: 500000 });
  });
});

describe("matchModel with an external source", () => {
  it("outranks pi-ai-catalog and models.dev for a model the external table declares", () => {
    const result = matchModel({
      id: "glm-5.3-flash-uncensored",
      modelsDev: () => ({ contextWindow: 32000 }), // a wrong public-catalog guess
      external: (id) => (id === "glm-5.3-flash-uncensored" ? { contextWindow: 1048576 } : undefined),
    });
    expect(result.capability.contextWindow).toBe(1048576);
    expect(result.sources).toContain("external");
    expect(result.sources.indexOf("external")).toBeGreaterThan(result.sources.indexOf("models.dev"));
  });

  it("leaves the model untouched when the external source has no entry for it", () => {
    const result = matchModel({
      id: "some-other-model",
      modelsDev: () => ({ contextWindow: 200000 }),
      external: () => undefined,
    });
    expect(result.capability.contextWindow).toBe(200000);
    expect(result.sources).not.toContain("external");
  });

  it("lets the external effort list outrank a catalog/models.dev guess", () => {
    const result = matchModel({
      id: "longcat-2.5",
      modelsDev: () => ({ reasoningEfforts: { off: null, high: "high" } }),
      external: (id) =>
        id === "longcat-2.5"
          ? {
              reasoningEfforts: {
                off: null,
                minimal: null,
                low: "low",
                medium: null,
                high: "high",
                xhigh: "xhigh",
                max: "max",
              },
            }
          : undefined,
    });
    // ensureUniversalEfforts keeps the nulls and the full ladder; it does not
    // collapse back to the universal off+high pair.
    expect(result.capability.reasoningEfforts).toEqual({
      off: null,
      minimal: null,
      low: "low",
      medium: null,
      high: "high",
      xhigh: "xhigh",
      max: "max",
    });
    expect(result.sources).toContain("external");
    expect(result.sources.indexOf("external")).toBeGreaterThan(result.sources.indexOf("models.dev"));
  });
});
