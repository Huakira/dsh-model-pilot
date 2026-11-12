import { describe, expect, it } from "vitest";
import { extractInputModalities, sanitizeInput, Writer } from "../src/writer.js";

/**
 * Synthetic schemastery ref graph mirroring the real pi-ai model.input field:
 * object.input -> array -> union -> const "text" | "image" (verified against
 * dsh-llm-pi-ai 0.2.2-rc.1: MODALITIES = Object.keys({text,image})).
 */
function schemaWithModalities(values: string[]) {
  const refs: Record<string, unknown> = {};
  const constIds = values.map((v, i) => {
    const id = 100 + i;
    refs[String(id)] = { type: "const", value: v };
    return id;
  });
  refs["50"] = { type: "union", list: constIds };
  refs["51"] = { type: "array", inner: 50 };
  refs["60"] = { type: "object", dict: { id: 1, name: 2, contextWindow: 3, maxTokens: 4, input: 51 } };
  return { uid: 60, refs };
}

describe("input modality gating", () => {
  it("extracts text/image from the model.input schema", () => {
    const set = extractInputModalities(schemaWithModalities(["text", "image"]));
    expect(set && [...set].sort()).toEqual(["image", "text"]);
  });

  it("adapts to a future schema that adds video", () => {
    const set = extractInputModalities(schemaWithModalities(["text", "image", "video"]));
    expect(set?.has("video")).toBe(true);
    expect(set?.size).toBe(3);
  });

  it("returns undefined for an unintrospectable schema", () => {
    expect(extractInputModalities(undefined)).toBeUndefined();
    expect(extractInputModalities({})).toBeUndefined();
  });

  it("strips unsupported modalities, keeps supported ones, falls back to text", () => {
    const allowed = new Set(["text", "image"]);
    const { providers, stripped } = sanitizeInput({
      gw: {
        baseURL: "https://x/v1",
        defaultInput: ["text", "video"],
        models: [
          { id: "a", input: ["text", "image", "video"] },
          { id: "b", input: ["video"] },
          { id: "c", input: ["text"] },
          { id: "d" },
        ],
      },
    } as any, allowed);
    expect(stripped).toEqual(["video"]);
    const gw: any = providers.gw;
    expect(gw.defaultInput).toEqual(["text"]);
    expect(gw.models[0].input).toEqual(["text", "image"]);
    expect(gw.models[1].input).toEqual(["text"]); // only-video -> text fallback
    expect(gw.models[2].input).toEqual(["text"]);
    expect(gw.models[3].input).toBeUndefined(); // untouched when absent
  });

  it("Writer.writeProviders sanitizes video before the settings write", async () => {
    let stored: any = {};
    let revision = 0;
    const settings: any = {
      documentPath: "",
      describe: () => [{ ns: "llm-pi-ai", value: { providers: stored }, revision, schema: schemaWithModalities(["text", "image"]) }],
      async replace(_ns: string, section: any) { stored = structuredClone(section.providers); revision++; },
      async update() {},
    };
    const writer = new Writer(settings, {});
    await writer.writeProviders({
      gw: { baseURL: "https://x/v1", api: "openai-completions", models: [{ id: "m", input: ["text", "image", "video"] }] },
    } as any, "test");
    expect(stored.gw.models[0].input).toEqual(["text", "image"]);
  });
});