import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSupportedProtocols } from "../src/writer.js";
import { buildModelsDevIndex, capabilityFromModelsDev, ModelsDevSource } from "../src/modelsdev.js";
import { fetchGeminiListing, probeModel } from "../src/fetchers.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("extractSupportedProtocols", () => {
  const schema = {
    uid: 1,
    refs: {
      "1": { type: "object", dict: { providers: 2 } },
      "2": { type: "dict", inner: 3 },
      "3": { type: "object", dict: { api: 4 } },
      "4": { type: "union", list: [5, 6, 7] },
      "5": { type: "const", value: "openai-completions" },
      "6": { type: "const", value: "openai-responses" },
      "7": { type: "const", value: "anthropic-messages" },
    },
  };
  it("reads the adapter's protocol union", () => {
    expect(extractSupportedProtocols(schema)).toEqual(["openai-completions", "openai-responses", "anthropic-messages"]);
  });
  it("returns undefined when not introspectable", () => {
    expect(extractSupportedProtocols(undefined)).toBeUndefined();
    expect(extractSupportedProtocols({ uid: 1, refs: { "1": { type: "object", dict: {} } } })).toBeUndefined();
  });
});

describe("models.dev source", () => {
  const doc = {
    deepseek: {
      models: {
        "deepseek-flash": {
          id: "deepseek-flash",
          reasoning: true,
          reasoning_options: [{ type: "toggle" }, { type: "effort", values: ["low", "high", "max"] }],
          modalities: { input: ["text", "image"], output: ["text"] },
          limit: { context: 1048576, output: 393216 },
        },
        "non-reasoning": { id: "non-reasoning", reasoning: false, limit: { context: 8192, output: 2048 } },
      },
    },
  };
  it("extracts capability incl. effort ladder", () => {
    const cap = capabilityFromModelsDev(doc.deepseek.models["deepseek-flash"]);
    expect(cap.contextWindow).toBe(1048576);
    expect(cap.maxTokens).toBe(393216);
    expect(cap.input).toEqual(["text", "image"]);
    expect(cap.reasoningEfforts).toEqual({ off: null, low: "low", high: "high", max: "max" });
  });
  it("marks non-reasoning models false", () => {
    expect(capabilityFromModelsDev(doc.deepseek.models["non-reasoning"]).reasoningEfforts).toBe(false);
  });
  it("indexes across providers and looks up", () => {
    const index = buildModelsDevIndex(doc as never, 123);
    expect(index.byId.get("deepseek-flash")?.contextWindow).toBe(1048576);
  });
  it("loads from network then cache, falls back to stale offline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "md-"));
    const cachePath = join(dir, "cache.json");
    try {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(doc), { status: 200, headers: { "content-type": "application/json" } }));
      const src = new ModelsDevSource(cachePath, 1000, fetchMock as never);
      const first = await src.load();
      expect(first.source).toBe("network");
      expect(src.lookup("deepseek-flash")?.maxTokens).toBe(393216);
      // Second load within TTL uses cache (no fetch).
      fetchMock.mockClear();
      const second = await src.load();
      expect(second.source).toBe("cache");
      expect(fetchMock).not.toHaveBeenCalled();
      // Force expiry + network failure -> stale cache.
      const src2 = new ModelsDevSource(cachePath, 0, vi.fn(async () => { throw new Error("offline"); }) as never);
      const third = await src2.load();
      expect(third.source).toBe("stale");
      expect(src2.lookup("deepseek-flash")?.contextWindow).toBe(1048576);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("gemini listing", () => {
  it("filters generateContent and strips models/ prefix", async () => {
    const body = {
      models: [
        { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent", "countTokens"] },
        { name: "models/embedding-001", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    const rows = await fetchGeminiListing("https://gw.example/v1beta", "key123");
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("gemini-3.8-flash");
    expect(rows[0].contextWindow).toBe(1048576);
    expect(rows[0].maxTokens).toBe(65536);
  });
  it("throws on non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
    await expect(fetchGeminiListing("https://gw.example/v1beta", "bad")).rejects.toThrow(/403/);
  });
});

describe("probe", () => {
  it("treats 4xx as reachable, network error as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
    const ok = await probeModel("openai-completions", "https://gw.example/v1", "m1", "k");
    expect(ok.reachable).toBe(true);
    expect(ok.status).toBe(400);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const bad = await probeModel("anthropic-messages", "https://gw.example", "m1", "k");
    expect(bad.reachable).toBe(false);
    expect(bad.error).toMatch(/ECONNREFUSED/);
  });
});