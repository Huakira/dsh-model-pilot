import { describe, expect, it } from "vitest";
import { extractReasoningEffortKeys, sanitizeReasoningEfforts, Writer } from "../src/writer.js";

/**
 * Synthetic schemastery ref graph mirroring the real pi-ai model.reasoningEfforts
 * field: union(const false, dict) whose dict sKey is a union of level consts and
 * inner is union(string, const null) (verified against dsh-llm-pi-ai 0.2.2-rc.1:
 * off/minimal/low/medium/high/xhigh/max).
 */
function schemaWithEffortKeys(values: string[]) {
  const refs: Record<string, unknown> = {};
  const constIds = values.map((v, i) => {
    const id = 100 + i;
    refs[String(id)] = { type: "const", value: v };
    return id;
  });
  refs["50"] = { type: "union", list: constIds }; // sKey
  refs["52"] = { type: "string" };
  refs["53"] = { type: "const", value: null };
  refs["54"] = { type: "union", list: [52, 53] }; // inner value
  refs["55"] = { type: "dict", inner: 54, sKey: 50 };
  refs["56"] = { type: "const", value: false };
  refs["57"] = { type: "union", list: [56, 55] }; // reasoningEfforts
  refs["60"] = { type: "object", dict: { id: 1, name: 2, reasoningEfforts: 57 } };
  return { uid: 60, refs };
}

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

describe("reasoningEffort level gating", () => {
  it("extracts the accepted level keys from the schema", () => {
    const set = extractReasoningEffortKeys(schemaWithEffortKeys(LEVELS));
    expect(set && [...set].sort()).toEqual([...LEVELS].sort());
  });

  it("adapts to a future schema that adds a level", () => {
    const set = extractReasoningEffortKeys(schemaWithEffortKeys([...LEVELS, "ultra"]));
    expect(set?.has("ultra")).toBe(true);
    expect(set?.size).toBe(LEVELS.length + 1);
  });

  it("returns undefined for an unintrospectable schema", () => {
    expect(extractReasoningEffortKeys(undefined)).toBeUndefined();
    expect(extractReasoningEffortKeys({})).toBeUndefined();
  });

  it("strips off-schema keys (none), keeps valid string|null values, leaves false/absent", () => {
    const allowed = new Set(LEVELS);
    const { providers, stripped } = sanitizeReasoningEfforts({
      gw: {
        baseURL: "https://x/v1",
        models: [
          { id: "a", reasoningEfforts: { off: null, none: "none", minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" } },
          { id: "b", reasoningEfforts: false },
          { id: "c" },
          { id: "d", reasoningEfforts: { none: "none" } },
        ],
      },
    } as any, allowed);
    expect(stripped).toEqual(["none"]);
    const gw: any = providers.gw;
    expect(gw.models[0].reasoningEfforts).toEqual({ off: null, minimal: "minimal", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" });
    expect(gw.models[1].reasoningEfforts).toBe(false); // untouched
    expect(gw.models[2].reasoningEfforts).toBeUndefined(); // untouched
    expect(gw.models[3].reasoningEfforts).toEqual({}); // all keys dropped -> empty map (schema-valid)
  });

  it("Writer.writeProviders strips none before the settings write", async () => {
    let stored: any = {};
    let revision = 0;
    const settings: any = {
      documentPath: "",
      describe: () => [{ ns: "llm-pi-ai", value: { providers: stored }, revision, schema: schemaWithEffortKeys(LEVELS) }],
      async replace(_ns: string, section: any) { stored = structuredClone(section.providers); revision++; },
      async update() {},
    };
    const writer = new Writer(settings, {});
    await writer.writeProviders({
      gw: { baseURL: "https://x/v1", api: "openai-completions", models: [{ id: "m", reasoningEfforts: { off: null, none: "none", high: "high" } }] },
    } as any, "test");
    expect(stored.gw.models[0].reasoningEfforts).toEqual({ off: null, high: "high" });
  });
});