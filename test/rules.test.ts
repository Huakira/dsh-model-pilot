import { describe, expect, it } from "vitest";
import { DEFAULT_PROTOCOL_RULES, matchesPattern, normalizeRules, protocolByRules } from "../src/protocol.js";
import { planProtocolSplit } from "../src/split.js";
import { compatFor } from "../src/protocol.js";

describe("protocol rules (0.1.23)", () => {
  const d = DEFAULT_PROTOCOL_RULES;
  it.each([
    ["claude-opus-5-5", "anthropic-messages"],
    ["anthropic/claude-sonnet-5-5", "anthropic-messages"],
    ["gpt-6.1-sol", "openai-responses"],
    ["grok-4.6", "openai-responses"],
    ["muse-spark-1.3-contributor", "openai-responses"],
    ["LongCat-2.5", "openai-responses"],
    ["o3-mini", "openai-responses"],
    ["minimax-m3.1-flash", undefined],
    ["kimi-k3", undefined],
    ["deepseek-v4.1-flash-1017", undefined],
  ])("%s → %s", (id, p) => expect(protocolByRules(id, d)).toBe(p));
  it("substring vs glob", () => {
    expect(matchesPattern("minimax", "MiniMax-M3")).toBe(true);
    expect(matchesPattern("mini*", "x-minimax")).toBe(false);
    expect(matchesPattern("*minimax*", "x-minimax")).toBe(true);
    expect(matchesPattern("gpt-6.?-sol", "gpt-6.1-sol")).toBe(true);
    expect(matchesPattern("a.b", "axb")).toBe(false);
  });
  it("user rules win; anthropic checked first", () => {
    const r = normalizeRules({ responses: ["minimax"], anthropic: ["minimax-m3.1*"] });
    expect(protocolByRules("minimax-m3", r)).toBe("openai-responses");
    expect(protocolByRules("minimax-m3.1-flash", r)).toBe("anthropic-messages");
    expect(protocolByRules("claude-x", r)).toBeUndefined();
  });
  it("missing keys fall back to defaults, empty list means none", () => {
    expect(normalizeRules(undefined)).toEqual(d);
    expect(normalizeRules({ anthropic: [] }).anthropic).toEqual([]);
  });
  it("no rule match stays on the route", () => {
    const plan = planProtocolSplit({
      routeId: "hub", routeApi: "openai-completions",
      models: [{ id: "minimax-m3" } as any, { id: "claude-x" } as any],
      moves: { "hub/minimax-m3": { to: "hub-anthropic-messages", protocol: "anthropic-messages", auto: true } },
      supportedProtocols: ["openai-completions", "anthropic-messages"],
      suggest: (id) => protocolByRules(id, d), compatFor,
    });
    expect(plan.stay.map((m) => m.id)).toEqual(["minimax-m3"]);
    expect(plan.moves["hub/minimax-m3"]).toBeUndefined();
    expect(plan.shards["hub-anthropic-messages"].map((m) => m.id)).toEqual(["claude-x"]);
  });
});
