import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, name } from "../src/index.js";

/** In-memory mock of the llm-pi-ai settings namespace with revision semantics. */
function mockSettings(initial: Record<string, unknown>) {
  let providers = structuredClone(initial);
  let revision = 0;
  const seam = {
    documentPath: "",
    describe() {
      return [{ ns: "llm-pi-ai", value: { providers }, revision, schema: undefined }];
    },
    async update(_ns: string, patch: any, expected?: number) {
      if (expected !== undefined && expected !== revision) {
        const e: any = new Error("conflict");
        e.code = "SETTINGS_CONFLICT";
        e.expected = expected;
        e.actual = revision;
        throw e;
      }
      providers = { ...providers, ...(patch.providers ?? {}) };
      revision++;
    },
    async replace(_ns: string, section: any, expected?: number) {
      if (expected !== undefined && expected !== revision) {
        const e: any = new Error("conflict");
        e.code = "SETTINGS_CONFLICT";
        e.expected = expected;
        e.actual = revision;
        throw e;
      }
      providers = structuredClone(section.providers ?? {});
      revision++;
    },
  };
  return { seam, getProviders: () => providers as any, getRevision: () => revision };
}

function mockCtx(settings: any, listing: any[]) {
  const routes = new Map<string, any>();
  const ctx: any = {
    settings,
    llm: { discoverModels: async () => listing },
    credentials: {
      resolve: async () => ({ value: "test-key", source: "file" }),
      set: async () => {},
      unset: async () => {},
      describe: async () => ({ configured: true, writable: true }),
    },
    connection: { fetch: { register: (route: any) => { routes.set(route.path, route); return () => {}; } } },
    logger: { info: () => {}, warn: () => {} },
    effect: () => () => {},
  };
  return { ctx, routes };
}

const tempDirs: string[] = [];
function tempDocPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "pilot-test-"));
  tempDirs.push(dir);
  return join(dir, "cordis.patch.yml");
}
beforeEach(() => {
  // Keep the test offline: models.dev falls back to "none"; the pi-ai catalog
  // still loads via dynamic import, and llm.discoverModels is mocked.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline-test"); }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function callRoute(routes: Map<string, any>, path: string, method: "GET" | "POST", body?: unknown) {
  const route = routes.get(path);
  if (!route) throw new Error(`no route ${path}`);
  const request = new Request(`http://localhost${path}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
  const res = await route.fetch(request);
  return { status: res.status, data: await res.json() };
}

describe("host integration", () => {
  it("registers all API routes", async () => {
    const settings = mockSettings({});
    settings.seam.documentPath = tempDocPath();
    const { ctx, routes } = mockCtx(settings.seam, []);
    apply(ctx, {} as any);
    for (const p of ["state", "refresh", "provider", "override", "rollback", "options"]) {
      expect(routes.has(`/api/dsh-model-pilot/${p}`)).toBe(true);
    }
  });

  it("adds a provider then refreshes models into llm-pi-ai", async () => {
    const settings = mockSettings({});
    settings.seam.documentPath = tempDocPath();
    const listing = [
      { id: "deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash 1017" },
      { id: "glm-5.3-flash", name: "GLM-5.3 Flash", contextWindow: 1000000, maxTokens: 131072 },
    ];
    const { ctx, routes } = mockCtx(settings.seam, listing);
    apply(ctx, {} as any);

    // Add provider.
    const add = await callRoute(routes, "/api/dsh-model-pilot/provider", "POST", {
      id: "completions",
      displayName: "Axon",
      baseURL: "https://axon.example/v1",
      api: "openai-completions",
      apiKey: "secret",
    });
    expect(add.data.ok).toBe(true);
    expect(settings.getProviders().completions.baseURL).toBe("https://axon.example/v1");
    expect(settings.getProviders().completions.apiKeyEnv).toBeTruthy();

    // Refresh.
    const refresh = await callRoute(routes, "/api/dsh-model-pilot/refresh", "POST", { routes: ["completions"] });
    expect(refresh.data.ok).toBe(true);
    const models = settings.getProviders().completions.models;
    expect(models.length).toBe(2);
    const ds = models.find((m: any) => m.id === "deepseek-v4.1-flash-1017");
    expect(ds).toBeTruthy();
    // Catalog (real pi-ai on nyc) should give deepseek a thinkingFormat + efforts.
    expect(ds.contextWindow).toBeGreaterThan(0);
    expect(ds.maxTokens).toBeGreaterThan(0);
    const glm = models.find((m: any) => m.id === "glm-5.3-flash");
    expect(glm.contextWindow).toBe(1000000);
    expect(glm.compat.thinkingFormat).toBe("zai");
  });

  it("state endpoint reports providers and seams", async () => {
    const settings = mockSettings({ r1: { api: "openai-completions", baseURL: "https://x/v1", models: [] } });
    settings.seam.documentPath = tempDocPath();
    const { ctx, routes } = mockCtx(settings.seam, []);
    apply(ctx, {} as any);
    const state = await callRoute(routes, "/api/dsh-model-pilot/state", "GET");
    expect(state.data.ok).toBe(true);
    expect(state.data.providers.r1).toBeTruthy();
    expect(state.data.seams.settings).toBe(true);
  });

  it("rollback restores a prior snapshot", async () => {
    const settings = mockSettings({});
    settings.seam.documentPath = tempDocPath();
    const { ctx, routes } = mockCtx(settings.seam, [{ id: "m1" }]);
    apply(ctx, {} as any);
    await callRoute(routes, "/api/dsh-model-pilot/provider", "POST", { id: "r1", baseURL: "https://x/v1", api: "openai-completions" });
    await callRoute(routes, "/api/dsh-model-pilot/refresh", "POST", { routes: ["r1"] });
    expect(settings.getProviders().r1.models.length).toBe(1);
    // Remove the route, then rollback to before removal.
    const stateBefore = await callRoute(routes, "/api/dsh-model-pilot/state", "GET");
    const backups = stateBefore.data.backups;
    expect(backups.length).toBeGreaterThan(0);
    await callRoute(routes, "/api/dsh-model-pilot/provider", "POST", { action: "remove", id: "r1" });
    expect(settings.getProviders().r1).toBeUndefined();
    // Restore the most recent backup that still had r1 with models.
    const target = backups.find((b: any) => b.reason.includes("refresh")) ?? backups[0];
    const rb = await callRoute(routes, "/api/dsh-model-pilot/rollback", "POST", { backupId: target.id });
    expect(rb.data.ok).toBe(true);
  });
});