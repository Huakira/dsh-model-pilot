/**
 * Protocol-specific upstream helpers that pi-ai's built-in discovery does not
 * cover: the Gemini model listing (pi-ai 0.2.2-rc.1 lists only the three
 * OpenAI/Anthropic protocols) and a minimal reachability probe.
 *
 * These run host-side; the API key never reaches the browser. Listing helpers
 * only read model metadata — they never rewrite a route's baseURL/endpoint.
 */
import type { ListingRow, Modality, Protocol } from "./types.js";

const MAX_BYTES = 4 * 1024 * 1024;

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("listing exceeds 4MB");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) throw new Error("listing exceeds 4MB");
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

interface GeminiModel {
  name?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

/**
 * List Gemini models. The baseURL is expected to already include the version
 * path (e.g. …/v1beta), matching pi-ai's gemini client convention. Only models
 * that support generateContent are returned (chat models, not embedders).
 */
export async function fetchGeminiListing(baseURL: string, apiKey: string | undefined, signal?: AbortSignal): Promise<ListingRow[]> {
  const base = baseURL.replace(/\/+$/, "");
  const url = `${base}/models${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`;
  const response = await fetch(url, { method: "GET", headers: { accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`);
  const body = JSON.parse(await readBounded(response)) as { models?: GeminiModel[] };
  const rows: ListingRow[] = [];
  for (const m of body.models ?? []) {
    if (!m.name) continue;
    if (Array.isArray(m.supportedGenerationMethods) && !m.supportedGenerationMethods.includes("generateContent")) continue;
    const id = m.name.replace(/^models\//, "");
    const row: ListingRow = { id, name: m.displayName ?? id };
    if (typeof m.inputTokenLimit === "number" && m.inputTokenLimit > 0) row.contextWindow = m.inputTokenLimit;
    if (typeof m.outputTokenLimit === "number" && m.outputTokenLimit > 0) row.maxTokens = m.outputTokenLimit;
    rows.push(row);
  }
  return rows;
}

export interface ProbeResult {
  reachable: boolean;
  status?: number;
  error?: string;
  protocol: Protocol;
}

/**
 * Minimal reachability probe: one tiny request (max output 1 token) for a single
 * model on a route. Opt-in and user-triggered; on a normalized gateway this only
 * proves reachability, not protocol fidelity (the knowledge base handles that).
 */
export async function probeModel(
  protocol: Protocol,
  baseURL: string,
  modelId: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<ProbeResult> {
  const base = baseURL.replace(/\/+$/, "");
  let url: string;
  let headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  let body: unknown;
  switch (protocol) {
    case "anthropic-messages":
      url = `${base}/v1/messages`;
      headers = { ...headers, "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" };
      body = { model: modelId, max_tokens: 1, messages: [{ role: "user", content: "hi" }] };
      break;
    case "openai-responses":
      url = `${base}/responses`;
      headers = { ...headers, authorization: `Bearer ${apiKey ?? ""}` };
      body = { model: modelId, input: "hi", max_output_tokens: 1 };
      break;
    case "gemini":
      url = `${base}/models/${encodeURIComponent(modelId)}:generateContent${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`;
      body = { contents: [{ parts: [{ text: "hi" }] }], generationConfig: { maxOutputTokens: 1 } };
      break;
    case "openai-completions":
    default:
      url = `${base}/chat/completions`;
      headers = { ...headers, authorization: `Bearer ${apiKey ?? ""}` };
      body = { model: modelId, messages: [{ role: "user", content: "hi" }], max_tokens: 1 };
      break;
  }
  try {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    // Any HTTP answer (even 4xx) means the endpoint is reachable; only network
    // failure / 5xx counts as unreachable for a reachability probe.
    return { reachable: response.status < 500, status: response.status, protocol };
  } catch (error) {
    return { reachable: false, error: String(error instanceof Error ? error.message : error), protocol };
  }
}

/** Default input modalities for a Gemini chat model (listing rarely states them). */
export const GEMINI_DEFAULT_INPUT: Modality[] = ["text", "image"];
/**
 * Cheap "does this endpoint speak this protocol?" check: a request with an
 * empty JSON body. Any non-404/405 answer means the route exists (a 400 about
 * the payload/model still proves the wire endpoint is served), so no tokens are
 * spent and no valid model is needed. Used to gate per-model protocol splitting:
 * a model is only moved onto a protocol the gateway actually answers.
 */
/** Drop a trailing version segment that a protocol client adds itself. */
export function stripTrailingV1(baseURL: string): string {
  return baseURL.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

export async function probeProtocolEndpoint(
  protocol: Protocol,
  baseURL: string,
  apiKey: string | undefined,
  signal?: AbortSignal,
): Promise<boolean> {
  const base = baseURL.replace(/\/+$/, "");
  let url: string;
  let headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  switch (protocol) {
    case "anthropic-messages":
      // The Anthropic SDK appends /v1/messages to its baseURL, so a route base
      // that already ends in /v1 must lose it here (see shardBaseURL).
      url = `${stripTrailingV1(base)}/v1/messages`;
      headers = { ...headers, "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" };
      break;
    case "openai-responses":
      url = `${base}/responses`;
      headers = { ...headers, authorization: `Bearer ${apiKey ?? ""}` };
      break;
    case "gemini":
      url = `${base}/models`;
      if (apiKey) url += `?key=${encodeURIComponent(apiKey)}`;
      break;
    case "openai-completions":
    default:
      url = `${base}/chat/completions`;
      headers = { ...headers, authorization: `Bearer ${apiKey ?? ""}` };
      break;
  }
  try {
    const response = await fetch(url, { method: "POST", headers, body: "{}", signal });
    return response.status !== 404 && response.status !== 405 && response.status !== 501;
  } catch {
    return false;
  }
}
