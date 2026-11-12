import { describe, expect, it } from "vitest";
import {
  familyOf,
  suggestProtocol,
  routeProtocol,
  thinkingFormatFor,
  defaultEfforts,
  compatFor,
  normalizeId,
  stripRoutingPrefix,
} from "../src/protocol.js";
import {
  buildCatalogIndex,
  lookupCatalog,
  effortsFromLevelMap,
  capabilityFromEntry,
  type CatalogLoader,
} from "../src/catalog.js";
import { matchModel } from "../src/matcher.js";
import { extractCompatKeys, stripUnknownCompat } from "../src/writer.js";

const fixtureLoader: CatalogLoader = {
  providers: () => ["fireworks", "opencode", "zai"],
  models: (p) => {
    if (p === "fireworks")
      return [
        {
          id: "accounts/fireworks/models/deepseek-v4p1-flash-1017",
          name: "DeepSeek V4.1 Flash 1017",
          api: "anthropic-messages",
          provider: "fireworks",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 1000000,
          maxTokens: 384000,
          thinkingLevelMap: { off: "none", minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" },
          compat: { forceAdaptiveThinking: true },
          type: "chat",
        },
      ];
    if (p === "opencode")
      return [
        {
          id: "deepseek-v4.1-flash-1017",
          name: "DeepSeek V4.1 Flash 1017",
          api: "openai-completions",
          provider: "opencode",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 1000000,
          maxTokens: 384000,
          thinkingLevelMap: { off: null, low: "low", high: "high", max: "max" },
          compat: { requiresReasoningContentOnAssistantMessages: true },
          type: "chat",
        },
      ];
    if (p === "zai")
      return [
        {
          id: "glm-5.3-flash",
          name: "GLM-5.3 Flash",
          api: "openai-completions",
          provider: "zai",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 1000000,
          maxTokens: 131072,
          thinkingLevelMap: { low: "low", high: "high", max: "max" },
          type: "chat",
        },
      ];
    return [];
  },
  generatedAt: () => 1762800000000,
};

describe("protocol", () => {
  it("normalizes and strips routing prefixes", () => {
    expect(normalizeId("  Auto/DeepSeek-V4.1-Flash-1017 ")).toBe("auto/deepseek-v4.1-flash-1017");
    expect(stripRoutingPrefix("auto/deepseek-v4.1-flash-1017")).toBe("deepseek-v4.1-flash-1017");
    expect(stripRoutingPrefix("accounts/fireworks/models/x")).toBe("accounts/fireworks/models/x");
  });
  it("detects families", () => {
    expect(familyOf("deepseek-v4.1-flash-1017")).toBe("deepseek");
    expect(familyOf("claude-sonnet-5")).toBe("claude");
    expect(familyOf("gemini-3.8-flash")).toBe("gemini");
    expect(familyOf("glm-5.3-flash")).toBe("glm");
    expect(familyOf("qwen3.8-max-preview")).toBe("qwen");
    expect(familyOf("gpt-5.6-luna")).toBe("gpt");
    expect(familyOf("grok-4.7")).toBe("grok");
    expect(familyOf("kimi-k3")).toBe("kimi");
    expect(familyOf("mystery-model")).toBe("generic");
  });
  it("suggests protocols by family", () => {
    expect(suggestProtocol("claude-sonnet-5")).toBe("anthropic-messages");
    expect(suggestProtocol("gemini-3.8-flash")).toBe("gemini");
    expect(suggestProtocol("gpt-5.6")).toBe("openai-responses");
    expect(suggestProtocol("deepseek-v4.1-flash-1017")).toBe("openai-completions");
  });
  it("route api is authoritative", () => {
    expect(routeProtocol("anthropic-messages", "deepseek-v4.1-flash-1017")).toBe("anthropic-messages");
    expect(routeProtocol(undefined, "claude-x")).toBe("anthropic-messages");
    expect(routeProtocol("bogus", "glm-5.3")).toBe("openai-completions");
  });
  it("maps thinkingFormat by family and protocol", () => {
    expect(thinkingFormatFor("deepseek-x", "openai-completions")).toBe("deepseek");
    expect(thinkingFormatFor("glm-5.3", "openai-completions")).toBe("zai");
    expect(thinkingFormatFor("qwen3.8", "openai-completions")).toBe("qwen");
    expect(thinkingFormatFor("deepseek-x", "anthropic-messages")).toBeUndefined();
  });
  it("builds compat with deepseek reasoning placeholder", () => {
    const c = compatFor("deepseek-v4.1-flash-1017", "openai-completions");
    expect(c.thinkingFormat).toBe("deepseek");
    expect(c.supportsReasoningEffort).toBe(true);
    expect(c.requiresReasoningContentOnAssistantMessages).toBe(true);
    expect(c.supportsDeveloperRole).toBe(false);
  });
});

describe("catalog", () => {
  const index = buildCatalogIndex(fixtureLoader);
  it("indexes models across providers", () => {
    expect(index.modelCount).toBe(3);
    expect(index.providers).toEqual(["fireworks", "opencode", "zai"]);
  });
  it("looks up by standard id across providers", () => {
    const entries = lookupCatalog(index, "deepseek-v4.1-flash-1017");
    // opencode exact id + fireworks stripped-id alias both match
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.provider === "opencode")).toBe(true);
  });
  it("converts thinkingLevelMap to an offered ladder", () => {
    const eff = effortsFromLevelMap({ off: "none", minimal: null, low: "low", medium: null, high: "high", max: "max" });
    expect(eff).toEqual({ off: "none", low: "low", high: "high", max: "max" });
  });
  it("keeps off:null when thinking can be disabled", () => {
    expect(effortsFromLevelMap({ off: null, low: "low", high: "high" })).toEqual({ off: null, low: "low", high: "high" });
  });
  it("extracts capability from an entry", () => {
    const cap = capabilityFromEntry(lookupCatalog(index, "glm-5.3-flash")[0]);
    expect(cap.contextWindow).toBe(1000000);
    expect(cap.maxTokens).toBe(131072);
    expect(cap.input).toEqual(["text", "image"]);
    expect(cap.reasoningEfforts).toEqual({ low: "low", high: "high", max: "max" });
  });
});

describe("matcher", () => {
  const index = buildCatalogIndex(fixtureLoader);
  it("matches a catalog model with high confidence and attribution", () => {
    const r = matchModel({ id: "deepseek-v4.1-flash-1017", catalog: index, routeProtocol: "openai-completions" });
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    expect(r.sources).toContain("pi-ai-catalog");
    expect(r.matchedProviders).toContain("opencode");
    expect(r.capability.contextWindow).toBe(1000000);
    expect(r.capability.maxTokens).toBe(384000);
    expect(r.capability.input).toEqual(["text", "image"]);
    // route protocol openai-completions => deepseek thinkingFormat preserved
    expect(r.capability.compat?.thinkingFormat).toBe("deepseek");
  });
  it("falls back to family defaults for an unknown model", () => {
    const r = matchModel({ id: "totally-unknown-xyz", catalog: index });
    expect(r.sources).toEqual(["family-default"]);
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.capability.input).toEqual(["text"]);
  });
  it("uses endpoint caps when catalog is absent", () => {
    const r = matchModel({
      id: "kimi-k3",
      endpoint: { id: "kimi-k3", name: "Kimi K3", contextWindow: 256000, maxTokens: 64000, inputModalities: ["text", "image", "video"] },
    });
    expect(r.capability.contextWindow).toBe(256000);
    expect(r.capability.maxTokens).toBe(64000);
    expect(r.sources).toContain("endpoint");
    expect(r.name).toBe("Kimi K3");
  });
  it("catalog overlays endpoint caps", () => {
    const r = matchModel({
      id: "glm-5.3-flash",
      endpoint: { id: "glm-5.3-flash", contextWindow: 999 },
      catalog: index,
    });
    expect(r.capability.contextWindow).toBe(1000000); // catalog wins
  });
});

describe("writer schema gating", () => {
  const schema = {
    uid: 1,
    refs: {
      "1": { type: "object", dict: { providers: 2 } },
      "2": { type: "dict", inner: 3 },
      "3": { type: "object", dict: { models: 4, compat: 5 } },
      "4": { type: "array", inner: 6 },
      "6": { type: "object", dict: { id: 7, compat: 5 } },
      "5": { type: "object", dict: { thinkingFormat: 8, supportsReasoningEffort: 9, supportsDeveloperRole: 9 } },
      "7": { type: "string" },
      "8": { type: "string" },
      "9": { type: "boolean" },
    },
  };
  it("extracts the accepted compat keys", () => {
    const keys = extractCompatKeys(schema);
    expect(keys).toBeDefined();
    expect([...keys!].sort()).toEqual(["supportsDeveloperRole", "supportsReasoningEffort", "thinkingFormat"]);
  });
  it("strips unknown compat keys deeply", () => {
    const providers = {
      r1: {
        compat: { thinkingFormat: "deepseek", bogusNewKey: true },
        models: [{ id: "m1", compat: { supportsReasoningEffort: true, anotherBogus: 1 } }],
      },
    };
    const { providers: cleaned, stripped } = stripUnknownCompat(providers as never, extractCompatKeys(schema)!);
    expect(cleaned.r1.compat).toEqual({ thinkingFormat: "deepseek" });
    expect(cleaned.r1.models![0].compat).toEqual({ supportsReasoningEffort: true });
    expect(stripped.sort()).toEqual(["anotherBogus", "bogusNewKey"]);
  });
  it("returns undefined for a non-introspectable schema", () => {
    expect(extractCompatKeys(undefined)).toBeUndefined();
    expect(extractCompatKeys({})).toBeUndefined();
  });
});