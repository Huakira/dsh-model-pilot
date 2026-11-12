/** Same-origin API client for the dsh-model-pilot host routes. */
const BASE = "/api/dsh-model-pilot";

async function call<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { ok: false, error: `non-JSON response (${res.status})` };
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(err);
  }
  return data as T;
}

export interface StateResponse {
  ok: boolean;
  seams: Record<string, boolean>;
  catalog: { models: number; providers: number; generatedAt?: number } | null;
  catalogError?: string;
  supportedProtocols: string[];
  modelsDev: { ok: boolean; source: string; fetchedAt?: number };
  options: Record<string, unknown>;
  revision: number;
  providers: Record<string, ProviderView>;
  overrides: Record<string, Record<string, unknown>>;
  matchinfo: Record<string, Record<string, MatchInfoView>>;
  backups: { id: string; createdAt: number; reason: string; routes: number }[];
  meta: Record<string, unknown>;
}

export interface MatchInfoView {
  sources: string[];
  confidence: number;
  baseIdUsed?: string;
}

export interface ProviderView {
  displayName?: string;
  api?: string;
  baseURL?: string;
  apiKeyEnv?: string;
  keyConfigured: boolean;
  modelCount: number;
  models: ModelView[];
}

export interface ModelView {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: string[];
  reasoningEfforts?: Record<string, string | null> | false;
  compat?: Record<string, unknown>;
  stale?: boolean;
}

export const api = {
  state: () => call<StateResponse>("/state", "GET"),
  refresh: (routes?: string[]) => call<{ ok: boolean; perRoute: Record<string, unknown>; strippedCompatKeys: string[] }>("/refresh", "POST", { routes }),
  upsertProvider: (p: { id: string; displayName?: string; baseURL?: string; api?: string; apiKey?: string; apiKeyEnv?: string }) =>
    call<{ ok: boolean; id: string; detectedProtocol?: string; modelCount?: number; route?: { api?: string } }>("/provider", "POST", { action: "upsert", ...p }),
  removeProvider: (id: string) => call<{ ok: boolean }>("/provider", "POST", { action: "remove", id }),
  override: (route: string, model: string, capability: Record<string, unknown>, clear = false, moveToProtocol?: string) =>
    call<{ ok: boolean; moved?: boolean; from?: string; to?: string; model?: string; mirrorModels?: number; sourceModels?: number }>("/override", "POST", { route, model, capability, clear, ...(moveToProtocol ? { moveToProtocol } : {}) }),
  rollback: (backupId: string) => call<{ ok: boolean }>("/rollback", "POST", { backupId }),
  options: (patch: Record<string, unknown>) => call<{ ok: boolean; options: Record<string, unknown> }>("/options", "POST", patch),
  probe: (route: string, model?: string) => call<{ ok: boolean; reachable: boolean; status?: number; error?: string; protocol: string }>("/probe", "POST", { route, model }),
};