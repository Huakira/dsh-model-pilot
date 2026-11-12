import { describe, expect, it } from "vitest";
import {
  extractCompatGates,
  offeredCompatFields,
  allOfferedCompatFields,
} from "../src/adapter-gates.js";
import { sanitizeCompatByProtocol, Writer } from "../src/writer.js";

const SOURCE = `
const COMPLETIONS_COMPAT_GATE = {
  supportsReasoningEffort: "offer",
  thinkingFormat: "offer",
  openRouterRouting: "withhold",
};
const RESPONSES_COMPAT_GATE = {
  supportsStore: "offer",
};
const COMPAT_GATES = {
  "openai-completions": COMPLETIONS_COMPAT_GATE,
  "openai-responses": RESPONSES_COMPAT_GATE,
  "anthropic-messages": { forceAdaptiveThinking: "offer", supportsTemperature: "offer" },
};
`;

describe("adapter compat-gate extraction", () => {
  it("parses the three gate literals from adapter source", () => {
    const gates = extractCompatGates(SOURCE);
    expect(gates && Object.keys(gates).sort()).toEqual(["anthropic-messages", "openai-completions", "openai-responses"]);
    expect(gates?.["openai-completions"].thinkingFormat).toBe("offer");
    expect(gates?.["anthropic-messages"].forceAdaptiveThinking).toBe("offer");
  });

  it("offeredCompatFields excludes withhold; allOffered unions offers", () => {
    const gates = extractCompatGates(SOURCE)!;
    expect([...offeredCompatFields(gates, "openai-completions")].sort()).toEqual(["supportsReasoningEffort", "thinkingFormat"]);
    expect(offeredCompatFields(gates, "openai-completions").has("openRouterRouting")).toBe(false);
    expect(offeredCompatFields(gates, "unknown-protocol").size).toBe(0);
    expect([...allOfferedCompatFields(gates)].sort()).toEqual(["forceAdaptiveThinking", "supportsReasoningEffort", "supportsStore", "supportsTemperature", "thinkingFormat"]);
  });

  it("returns undefined on missing declarations or malformed source", () => {
    expect(extractCompatGates("const OTHER = {};")).toBeUndefined();
    expect(extractCompatGates("")).toBeUndefined();
    expect(extractCompatGates("const COMPLETIONS_COMPAT_GATE = { broken")).toBeUndefined();
  });
});

describe("sanitizeCompatByProtocol", () => {
  const gates = extractCompatGates(SOURCE)!;

  it("strips anthropic-only fields on completions, keeps them on anthropic", () => {
    const { providers, stripped } = sanitizeCompatByProtocol({
      comp: {
        api: "openai-completions", baseURL: "https://x/v1",
        compat: { openRouterRouting: {} } as any,
        models: [
          { id: "m1", compat: { forceAdaptiveThinking: true, thinkingFormat: "deepseek", supportsReasoningEffort: true } },
          { id: "m2", compat: { thinkingFormat: null } },
          { id: "m3", compat: { bogusKey: true } },
          { id: "m4" },
        ],
      } as any,
      anth: {
        api: "anthropic-messages", baseURL: "https://x/v1",
        models: [{ id: "m5", compat: { forceAdaptiveThinking: true } }],
      } as any,
    }, gates);
    const comp: any = providers.comp;
    const anth: any = providers.anth;
    expect(comp.models[0].compat).toEqual({ thinkingFormat: "deepseek", supportsReasoningEffort: true });
    expect(comp.models[1].compat).toEqual({}); // null value dropped
    expect(comp.models[2].compat).toEqual({}); // unknown key dropped
    expect(comp.models[3].compat).toBeUndefined(); // no compat untouched
    expect(comp.compat).toEqual({}); // withhold field dropped at route level
    expect(anth.models[0].compat).toEqual({ forceAdaptiveThinking: true }); // kept on anthropic
    expect(stripped).toContain("forceAdaptiveThinking");
    expect(stripped).toContain("openRouterRouting");
    expect(stripped).toContain("bogusKey");
  });

  it("Writer.writeProviders strips forceAdaptiveThinking via injected gates", async () => {
    let stored: any = {};
    let revision = 0;
    const settings: any = {
      documentPath: "",
      describe: () => [{ ns: "llm-pi-ai", value: { providers: stored }, revision, schema: undefined }],
      async replace(_ns: string, section: any) { stored = structuredClone(section.providers); revision++; },
      async update() {},
    };
    const writer = new Writer(settings, { compatGates: gates });
    await writer.writeProviders({
      gw: {
        baseURL: "https://x/v1", api: "openai-completions",
        models: [{ id: "minimax-m3.1-flash", compat: { forceAdaptiveThinking: true, thinkingFormat: "deepseek" } }],
      },
    } as any, "test");
    expect(stored.gw.models[0].compat).toEqual({ thinkingFormat: "deepseek" });
  });
});