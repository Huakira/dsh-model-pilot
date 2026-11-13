/**
 * Protocol routing and per-family wire-format knowledge.
 *
 * The route's configured `api` is authoritative (a gateway speaks whatever its
 * operator configured). Family heuristics only *suggest* a protocol when a route
 * has none, and pick the `thinkingFormat` / effort spelling a model family expects.
 * Nothing here ever sets a baseURL or endpoint.
 */
import type { ModelCompat, Protocol, ReasoningEfforts } from "./types.js";

/** Normalize a model id for matching: trim + lowercase. IDs are otherwise kept
 * verbatim (ids are expected to be standardized in your gateway). */
export function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

/** Strip a leading routing prefix gateways sometimes add (auto/, openrouter/…). */
export function stripRoutingPrefix(id: string): string {
  let out = normalizeId(id);
  // Only strip a known routing namespace, never a vendor path that is part of
  // the canonical id (e.g. accounts/fireworks/models/… is kept intact).
  out = out.replace(/^(auto|router|default)\//, "");
  return out;
}

/**
 * Reduce a gateway model id to the base model id for catalog fallback matching.
 * Gateways rename models (add a vendor prefix, a routing tag, or an uncensored/
 * latest variant suffix); the official catalog lists the bare model. We strip a
 * leading `vendor/` path segment, a trailing `:tag`, and a conservative variant
 * suffix, but deliberately keep `-preview`/`-thinking` (dropping them would
 * collapse a preview onto a different model).
 */
export function baseModelId(id: string): string {
  let out = normalizeId(id);
  // Drop a vendor prefix: keep only the last path segment(s) after the final "/".
  if (out.includes("/")) out = out.slice(out.lastIndexOf("/") + 1);
  // Drop a routing tag: qwen-4-max:fast -> qwen-4-max.
  out = out.replace(/:[a-z0-9][a-z0-9._-]*$/, "");
  // Drop a conservative variant suffix.
  out = out.replace(/-(uncensored|latest|free|fast|slow)$/i, "");
  return out;
}

/** Family buckets used for protocol + thinking-format heuristics. */
export type Family =
  | "claude"
  | "gemini"
  | "gpt"
  | "grok"
  | "deepseek"
  | "qwen"
  | "glm"
  | "kimi"
  | "minimax"
  | "muse"
  | "longcat"
  | "mistral"
  | "llama"
  | "generic";

export function familyOf(id: string): Family {
  const s = stripRoutingPrefix(id);
  if (/(^|\/)claude|anthropic\./.test(s)) return "claude";
  if (/(^|\/)gemini|google\./.test(s)) return "gemini";
  if (/(^|\/)gpt-|(^|\/)o[1-9]|(^|\/)chatgpt/.test(s)) return "gpt";
  if (/(^|\/)grok|xai\./.test(s)) return "grok";
  if (/deepseek/.test(s)) return "deepseek";
  if (/(^|\/)qwen|qwq|qvq/.test(s)) return "qwen";
  if (/(^|\/)glm|zai|chatglm/.test(s)) return "glm";
  if (/(^|\/)kimi|moonshot/.test(s)) return "kimi";
  if (/minimax|abab/.test(s)) return "minimax";
  if (/(^|\/)muse[-.]/.test(s)) return "muse";
  if (/longcat/.test(s)) return "longcat";
  if (/mistral|mixtral|magistral|devstral/.test(s)) return "mistral";
  if (/llama|meta\./.test(s)) return "llama";
  return "generic";
}

/**
 * Suggest a wire protocol from the model family.
 *
 * The mapping is the user's gateway convention (2026-11-12, minimax moved
 * 2026-11-13):
 *   claude                     → anthropic-messages
 *   gpt, grok, muse, longcat   → openai-responses
 *   everything else (glm, qwen, kimi, deepseek, minimax, …) → openai-completions
 *
 * MiniMax left anthropic-messages so that the anthropic route carries Claude
 * alone: lane-scoped proxy settings (billion-context's per-route renderNone and
 * effort pin, keyed by upstream URL) then apply to Claude only. MiniMax's
 * Chat Completions endpoint returns thinking in `reasoning_content`, which
 * pi-ai echoes back on assistant messages, so interleaved thinking survives.
 * Gemini keeps its native protocol name; adapters that do not implement it
 * simply leave those models on the route's own protocol.
 */
export function suggestProtocol(id: string): Protocol {
  switch (familyOf(id)) {
    case "claude":
      return "anthropic-messages";
    case "gemini":
      return "gemini";
    case "gpt":
    case "grok":
    case "muse":
    case "longcat":
      return "openai-responses";
    default:
      return "openai-completions";
  }
}

/** The route's api wins; otherwise fall back to the family suggestion. */
export function routeProtocol(routeApi: string | undefined, id: string): Protocol {
  if (routeApi && (PROTOCOL_SET as ReadonlySet<string>).has(routeApi)) return routeApi as Protocol;
  return suggestProtocol(id);
}
const PROTOCOL_SET = new Set<string>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "gemini",
]);

/**
 * thinkingFormat for a family on an OpenAI-style route. On anthropic/gemini
 * routes the native protocol carries thinking, so no openai-style format applies.
 */
export function thinkingFormatFor(id: string, protocol: Protocol): string | undefined {
  if (protocol === "anthropic-messages" || protocol === "gemini") return undefined;
  switch (familyOf(id)) {
    case "deepseek":
    case "longcat":
      return "deepseek";
    case "glm":
      return "zai";
    case "qwen":
      return "qwen";
    case "gpt":
    case "grok":
    case "claude":
    case "generic":
    default:
      return "openai";
  }
}

/**
 * Default effort ladder for a reasoning-capable family, as offered level -> wire
 * spelling. `off: null` means the level maps to "no thinking". Families that do
 * not reason return false. These are conservative defaults; the pi-ai catalog's
 * thinkingLevelMap overrides them when present.
 */
export function defaultEfforts(id: string): ReasoningEfforts | false {
  switch (familyOf(id)) {
    case "deepseek":
      return { off: null, low: "low", high: "high", max: "max" };
    case "glm":
      return { low: "low", high: "high", max: "max" };
    case "qwen":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "gpt":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "grok":
      return { off: null, low: "low", high: "high" };
    case "claude":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "gemini":
      return { off: null, low: "low", medium: "medium", high: "high" };
    case "minimax":
      // M3.1-Flash always thinks: `none`/disabled is a 400, and its depth goes
      // low..max. Other MiniMax models ignore reasoning_effort on Chat
      // Completions, so one level is offered (still marks the model reasoning,
      // which keeps reasoning_content echoed back).
      return /m3\.1-flash/.test(id.toLowerCase())
        ? { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }
        : { high: "high" };
    case "kimi":
    case "mistral":
      return { off: null, low: "low", high: "high" };
    default:
      return false;
  }
}

/** Whether a family is reasoning-capable by default. */
export function familyReasons(id: string): boolean {
  return defaultEfforts(id) !== false;
}

/**
 * Build the compat block for a model on a route. Only sets fields the installed
 * pi-ai schema is known to accept; the writer additionally strips unknown keys
 * against the live schema before writing (version gating).
 */
export function compatFor(id: string, protocol: Protocol): ModelCompat {
  const compat: ModelCompat = {};
  const fmt = thinkingFormatFor(id, protocol);
  if (fmt !== undefined) compat.thinkingFormat = fmt;
  if (familyReasons(id)) compat.supportsReasoningEffort = true;
  // Self-hosted relays generally reject the developer role; the catalog may
  // override. Default false is the safe relay assumption (matches better-effort).
  compat.supportsDeveloperRole = false;
  const fam = familyOf(id);
  if ((fam === "deepseek" || fam === "minimax") && protocol === "openai-completions") {
    compat.requiresReasoningContentOnAssistantMessages = true;
  }
  return compat;
}