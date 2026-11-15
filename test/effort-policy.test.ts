import { describe, expect, it } from "vitest";
import { ensureUniversalEfforts, UNIVERSAL_EFFORTS, defaultEfforts } from "../src/protocol.js";
import { matchModel } from "../src/matcher.js";
import { enforceEffortPolicy } from "../src/writer.js";
import type { CatalogIndex } from "../src/catalog.js";

describe("ensureUniversalEfforts", () => {
  it("adds the universal pair to a ladder missing it", () => {
    expect(ensureUniversalEfforts({ low: "low", medium: "medium", xhigh: "xhigh" })).toEqual({
      off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh",
    });
  });
  it("strips the default level and heals the YAML false key", () => {
    expect(ensureUniversalEfforts({ default: "default", false: null, high: "high" })).toEqual({
      off: null, high: "high",
    });
  });
  it("keeps a non-standard off spelling", () => {
    expect(ensureUniversalEfforts({ off: "none", low: "low" })).toEqual({
      off: "none", low: "low", high: "high",
    });
  });
  it("orders canonically without dropping unknown levels", () => {
    const out = ensureUniversalEfforts({ max: "max", high: "high", ultra: "ultra" });
    expect(Object.keys(out)).toEqual(["off", "high", "max", "ultra"]);
  });
  it("keeps existing spellings and never duplicates", () => {
    expect(ensureUniversalEfforts({ off: null, high: "high", low: "low" })).toEqual({
      off: null, low: "low", high: "high",
    });
  });
  it("universal pair constant is exactly off+high", () => {
    expect(UNIVERSAL_EFFORTS).toEqual({ off: null, high: "high" });
  });
});

describe("matcher effort policy", () => {
  const catalog = {
    byId: new Map(), byBase: new Map(),
    modelCount: 0, providers: [],
  } as unknown as CatalogIndex;

  it("unknown family with no sources lands on off+high, not false", () => {
    const r = matchModel({ id: "totally-unknown-xyz", catalog, routeProtocol: "openai-completions" });
    expect(r.capability.reasoningEfforts).toEqual({ off: null, high: "high" });
  });

  it("a family ladder keeps its levels and gains the pair (glm has no off)", () => {
    const r = matchModel({ id: "glm-some-new-model", catalog, routeProtocol: "openai-completions" });
    expect(r.capability.reasoningEfforts).toEqual({ off: null, low: "low", high: "high", max: "max" });
  });

  it("an explicit non-reasoning source still wins (false stays false)", () => {
    const r = matchModel({
      id: "glm-some-new-model",
      catalog,
      modelsDev: () => ({ reasoningEfforts: false }),
      routeProtocol: "openai-completions",
    });
    expect(r.capability.reasoningEfforts).toBe(false);
  });

  it("models.dev reasoning=true with no options still lands on off+high", () => {
    const r = matchModel({
      id: "totally-unknown-xyz",
      catalog,
      modelsDev: () => ({ contextWindow: 64000 }),
      routeProtocol: "openai-completions",
    });
    expect(r.capability.reasoningEfforts).toEqual({ off: null, high: "high" });
    expect(r.capability.contextWindow).toBe(64000);
  });

  it("a matched map with only a default level becomes the pair", () => {
    const r = matchModel({
      id: "totally-unknown-xyz",
      catalog,
      modelsDev: () => ({ reasoningEfforts: { default: "default" } as never }),
      routeProtocol: "openai-completions",
    });
    expect(r.capability.reasoningEfforts).toEqual({ off: null, high: "high" });
  });

  it("minimax m3.1 keeps its depth ladder plus the pair", () => {
    const fam = defaultEfforts("minimax-m3.1-flash");
    expect(fam).toEqual({ low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" });
    const r = matchModel({ id: "minimax-m3.1-flash", catalog, routeProtocol: "openai-completions" });
    expect(r.capability.reasoningEfforts).toEqual({
      off: null, low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max",
    });
  });
});

describe("enforceEffortPolicy", () => {
  it("sets the route default only when the route has none", () => {
    const providers = {
      a: { api: "openai-completions", models: [] },
      b: { api: "openai-completions", reasoning: "low", models: [] },
    } as never;
    const { providers: out, changedRoutes } = enforceEffortPolicy(providers, "high");
    expect(out.a.reasoning).toBe("high");
    expect(out.b.reasoning).toBe("low");
    expect(changedRoutes).toEqual(["a"]);
  });

  it("pair-ensures model ladders and leaves false alone", () => {
    const providers = {
      a: {
        api: "openai-completions",
        reasoning: "high",
        models: [
          { id: "m1", reasoningEfforts: { low: "low" } },
          { id: "m2", reasoningEfforts: false },
        ],
        modelOverrides: { m3: { reasoningEfforts: { default: "default" } } },
      },
    } as never;
    const { providers: out, changedRoutes } = enforceEffortPolicy(providers, "high");
    expect(out.a.models![0].reasoningEfforts).toEqual({ off: null, low: "low", high: "high" });
    expect(out.a.models![1].reasoningEfforts).toBe(false);
    expect((out.a.modelOverrides!.m3 as { reasoningEfforts: unknown }).reasoningEfforts).toEqual({
      off: null, high: "high",
    });
    expect(changedRoutes).toEqual(["a"]);
  });

  it("is idempotent and reports no changes on the second pass", () => {
    const providers = {
      a: { api: "openai-completions", models: [{ id: "m1", reasoningEfforts: { low: "low" } }] },
    } as never;
    const first = enforceEffortPolicy(providers, "high");
    expect(first.changedRoutes).toEqual(["a"]);
    const second = enforceEffortPolicy(first.providers, "high");
    expect(second.changedRoutes).toEqual([]);
    expect(second.providers).toEqual(first.providers);
  });

  it("undefined default effort skips route defaults but still normalizes ladders", () => {
    const providers = {
      a: { api: "openai-completions", models: [{ id: "m1", reasoningEfforts: { high: "high", default: "default" } }] },
    } as never;
    const { providers: out, changedRoutes } = enforceEffortPolicy(providers, undefined);
    expect((out.a as { reasoning?: string }).reasoning).toBeUndefined();
    expect(out.a.models![0].reasoningEfforts).toEqual({ off: null, high: "high" });
    expect(changedRoutes).toEqual(["a"]);
  });
});
