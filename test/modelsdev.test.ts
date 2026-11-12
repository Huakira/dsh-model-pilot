import { describe, expect, it } from "vitest";
import { buildModelsDevIndex, capabilityFromModelsDev } from "../src/modelsdev.js";
import { matchModel } from "../src/matcher.js";
import { baseModelId } from "../src/protocol.js";

/** Minimal provider doc builder. */
function doc(entries: Record<string, Record<string, unknown>>): any {
  const out: any = {};
  for (const [provider, models] of Object.entries(entries)) out[provider] = { models };
  return out;
}

describe("models.dev index", () => {
  it("majority-votes conflicting context windows", () => {
    const d = doc({
      p1: { "gpt-x": { limit: { context: 1050000, output: 128000 } } },
      p2: { "gpt-x": { limit: { context: 1050000, output: 128000 } } },
      p3: { "gpt-x": { limit: { context: 272000, output: 128000 } } },
    });
    const idx = buildModelsDevIndex(d, Date.now());
    expect(idx.byId.get("gpt-x")?.contextWindow).toBe(1050000);
  });

  it("maps 'none' effort to pi-ai's 'off': null", () => {
    const cap = capabilityFromModelsDev({
      reasoning: true,
      reasoning_options: [{ type: "effort", values: ["none", "low", "medium", "high"] }],
    });
    expect(cap.reasoningEfforts).toEqual({ off: null, low: "low", medium: "medium", high: "high" });
  });

  it("filters out modalities the adapter does not accept", () => {
    const cap = capabilityFromModelsDev({ modalities: { input: ["text", "image", "video", "pdf", "audio"] } });
    expect(cap.input).toEqual(["text", "image"]);
  });

  it("builds a byBase index for renamed models", () => {
    const d = doc({
      p1: { "gpt-6.1-sol": { limit: { context: 1050000, output: 128000 } } },
      p2: { "meituan/longcat-2.5": { limit: { context: 1048576, output: 64000 } } },
    });
    const idx = buildModelsDevIndex(d, Date.now());
    // vendor-prefixed id reduces to a base key
    expect(idx.byBase.get("longcat-2.5")?.contextWindow).toBe(1048576);
    // canonical id already in byId, not duplicated in byBase
    expect(idx.byBase.get("gpt-6.1-sol")).toBeUndefined();
    expect(idx.byId.get("gpt-6.1-sol")?.contextWindow).toBe(1050000);
  });
});

describe("matcher with models.dev primary", () => {
  const mdIndex = buildModelsDevIndex(
    doc({
      openai: { "gpt-6.1-sol": { limit: { context: 1050000, output: 128000 }, modalities: { input: ["text", "image"] }, reasoning_options: [{ type: "effort", values: ["none", "low", "high"] }] } },
      meituan: { "meituan/longcat-2.5": { limit: { context: 1048576, output: 64000 } } },
    }),
    Date.now(),
  );

  it("models.dev wins over pi-ai catalog on conflicting context", () => {
    // pi-ai catalog (static fixture) says 272000; models.dev says 1050000
    const r = matchModel({
      id: "gpt-6.1-sol",
      modelsDev: (id) => mdIndex.byId.get(id),
      modelsDevBase: () => undefined,
      routeProtocol: "openai-completions",
    });
    expect(r.capability.contextWindow).toBe(1050000);
    expect(r.sources).toContain("models.dev");
    expect(r.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it("models.dev byBase fallback matches renamed ids", () => {
    expect(mdIndex.byBase.get("longcat-2.5")?.contextWindow).toBe(1048576);
    const r = matchModel({
      id: "vendor-x/longcat-2.5", // vendor-prefixed: not in byId under this raw id
      modelsDev: () => undefined,
      modelsDevBase: (id) => mdIndex.byBase.get(baseModelId(id)),
      routeProtocol: "openai-completions",
    });
    expect(r.capability.contextWindow).toBe(1048576);
    expect(r.sources).toContain("models.dev");
    expect(r.baseIdUsed).toBe("longcat-2.5");
  });
});
