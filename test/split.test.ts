import { describe, expect, it } from "vitest";
import { planProtocolSplit, shardBaseURL, shardRoute } from "../src/split.js";
import { suggestProtocol, compatFor } from "../src/protocol.js";
import type { StoredModel } from "../src/types.js";

const model = (id: string): StoredModel => ({ id, name: id, contextWindow: 100000, maxTokens: 8000, input: ["text"] });

const plan = (models: StoredModel[], extra: Partial<Parameters<typeof planProtocolSplit>[0]> = {}) =>
  planProtocolSplit({
    routeId: "gw",
    routeApi: "openai-completions",
    models,
    moves: {},
    supportedProtocols: ["openai-completions", "openai-responses", "anthropic-messages"],
    suggest: suggestProtocol,
    compatFor,
    ...extra,
  });

describe("planProtocolSplit", () => {
  it("matches each family to its own protocol", () => {
    const r = plan([model("claude-sonnet-4"), model("gpt-5.1"), model("glm-5.3-flash"), model("grok-4")]);
    expect(r.stay.map((m) => m.id)).toEqual(["glm-5.3-flash"]);
    expect(r.shards["gw-anthropic-messages"].map((m) => m.id)).toEqual(["claude-sonnet-4"]);
    expect(r.shards["gw-openai-responses"].map((m) => m.id).sort()).toEqual(["gpt-5.1", "grok-4"]);
    expect(r.shardProtocols["gw-anthropic-messages"]).toBe("anthropic-messages");
  });

  it("records auto moves with the shard target", () => {
    const r = plan([model("claude-sonnet-4")]);
    expect(r.moves["gw/claude-sonnet-4"]).toEqual({
      to: "gw-anthropic-messages",
      protocol: "anthropic-messages",
      auto: true,
    });
  });

  it("recomputes compat for the target protocol instead of keeping the source's", () => {
    const r = plan([{ ...model("claude-sonnet-4"), compat: { thinkingFormat: "openai", supportsDeveloperRole: false } }]);
    const carried = r.shards["gw-anthropic-messages"][0];
    // anthropic carries thinking natively: no openai-style thinkingFormat.
    expect(carried.compat?.thinkingFormat).toBeUndefined();
  });

  it("leaves models alone when the adapter does not implement the suggested protocol", () => {
    const r = plan([model("gemini-3-pro")], { supportedProtocols: ["openai-completions", "openai-responses", "anthropic-messages"] });
    expect(r.stay.map((m) => m.id)).toEqual(["gemini-3-pro"]);
    expect(r.shards).toEqual({});
  });

  it("honours a user pin and never re-splits", () => {
    const r = plan([model("claude-sonnet-4")], {
      moves: { "gw/claude-sonnet-4": { to: "gw", protocol: "openai-completions", auto: false, pinned: true } },
    });
    expect(r.stay.map((m) => m.id)).toEqual(["claude-sonnet-4"]);
    expect(r.shards).toEqual({});
    expect(r.moves["gw/claude-sonnet-4"].pinned).toBe(true);
  });

  it("drops an auto move once the model no longer needs it", () => {
    const r = plan([model("glm-5.3-flash")], {
      moves: { "gw/claude-sonnet-4": { to: "gw-anthropic-messages", protocol: "anthropic-messages", auto: true } },
    });
    expect(r.moves["gw/claude-sonnet-4"]).toBeUndefined();
  });

  it("keeps other routes' moves untouched", () => {
    const r = plan([model("glm-5.3-flash")], {
      moves: { "other/x": { to: "other-openai-responses", protocol: "openai-responses", auto: true } },
    });
    expect(r.moves["other/x"]).toBeDefined();
  });

  it("keeps manual (non-auto) moves intact", () => {
    const r = plan([model("claude-sonnet-4")], {
      moves: { "gw/LongCat-2.5": { to: "gw-openai-responses", protocol: "openai-responses", auto: false } },
    });
    expect(r.moves["gw/LongCat-2.5"]).toBeDefined();
  });
});

describe("shardBaseURL", () => {
  it("trims /v1 for anthropic (the SDK prefixes /v1 itself)", () => {
    expect(shardBaseURL("anthropic-messages", "https://gw.example/v1")).toBe("https://gw.example");
  });
  it("keeps /v1 for openai-style protocols", () => {
    expect(shardBaseURL("openai-responses", "https://gw.example/v1")).toBe("https://gw.example/v1");
    expect(shardBaseURL("openai-completions", "https://gw.example/v1/")).toBe("https://gw.example/v1");
  });
  it("leaves a version-less base alone", () => {
    expect(shardBaseURL("anthropic-messages", "https://gw.example")).toBe("https://gw.example");
  });
});

describe("suggestProtocol mapping (user's gateway convention)", () => {
  const cases: Array<[string, string]> = [
    ["claude-opus-5-5", "anthropic-messages"],
    ["minimax-m3.1-flash", "anthropic-messages"],
    ["gpt-6.1-sol", "openai-responses"],
    ["grok-4.6", "openai-responses"],
    ["muse-spark-1.3-contributor", "openai-responses"],
    ["LongCat-2.5", "openai-responses"],
    ["glm-5.3-flash", "openai-completions"],
    ["qwen-4-max-preview", "openai-completions"],
    ["kimi-k3", "openai-completions"],
    ["deepseek-v4.1-flash-1017", "openai-completions"],
    ["step-5-preview", "openai-completions"],
    ["dots-3-note-preview", "openai-completions"],
  ];
  it.each(cases)("%s → %s", (id, protocol) => {
    expect(suggestProtocol(id)).toBe(protocol);
  });
});

describe("shardRoute (regression: shards must inherit parent settings)", () => {
  const parent = {
    displayName: "hub",
    api: "openai-completions" as const,
    baseURL: "https://gw.example/v1",
    apiKeyEnv: "GW_KEY",
    models: [{ id: "glm-5.3-flash" }],
    headers: { "x-tenant": "huake" },
    thinkingBudgets: { high: 8000 },
    defaultContextWindow: 1000000,
    defaultMaxTokens: 128000,
    defaultInput: ["text" as const],
    compat: { chatTemplateKwargs: {} },
    streamIdleTimeoutMs: 300000,
    maxRequestImages: 50,
    modelOverrides: { "glm-5.3-flash": { maxTokens: 9000 } },
  };

  it("inherits every parent transport setting, not just the four basics", () => {
    const s = shardRoute({ parent, parentId: "gw", shardId: "gw-openai-responses", protocol: "openai-responses" });
    for (const key of ["headers", "thinkingBudgets", "defaultContextWindow", "defaultMaxTokens", "defaultInput", "compat", "streamIdleTimeoutMs", "maxRequestImages", "modelOverrides"]) {
      expect(s[key], key).toEqual(parent[key as keyof typeof parent]);
    }
    expect(s.apiKeyEnv).toBe("GW_KEY");
  });

  it("overrides only protocol-scoped fields", () => {
    const s = shardRoute({ parent, parentId: "gw", shardId: "gw-anthropic-messages", protocol: "anthropic-messages" });
    expect(s.api).toBe("anthropic-messages");
    expect(s.baseURL).toBe("https://gw.example"); // anthropic SDK prefixes /v1 itself
    expect(s.displayName).toBe("hub · anthropic-messages");
  });

  it("does not alias the parent's objects (a shard edit must not mutate the parent)", () => {
    const s = shardRoute({ parent, parentId: "gw", shardId: "gw-openai-responses", protocol: "openai-responses" });
    (s.headers as Record<string, string>)["x-tenant"] = "changed";
    expect((parent.headers as Record<string, string>)["x-tenant"]).toBe("huake");
  });

  it("keeps a user's per-shard edits across a refresh", () => {
    const existing = { displayName: "my shard", apiKeyEnv: "OTHER_KEY", streamIdleTimeoutMs: 60000 };
    const s = shardRoute({ parent, parentId: "gw", shardId: "gw-openai-responses", protocol: "openai-responses", existing });
    expect(s.displayName).toBe("my shard");
    expect(s.apiKeyEnv).toBe("OTHER_KEY");
    expect(s.streamIdleTimeoutMs).toBe(60000);
    expect(s.headers).toEqual(parent.headers); // still inherits what it has no opinion on
  });
});
