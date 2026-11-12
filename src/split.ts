/**
 * Per-model protocol matching.
 *
 * pi-ai binds a wire protocol to a whole provider route (a models[] entry's
 * `api` is ignored), so "different models, different protocols" is implemented
 * as protocol shards: a route `<route>` keeps the models whose family protocol
 * matches its own, and every other family is carried onto `<route>-<protocol>`
 * which shares the same baseURL + key. This module is the pure planning step so
 * the rule is unit-testable without the settings seam.
 */
import type { ModelCapability, Protocol, StoredModel } from "./types.js";

export interface ProtocolMove {
  to: string;
  protocol: string;
  /** true when the plugin decided this (not a user click). */
  auto?: boolean;
  /** user pinned the model to its provider's protocol; never re-split. */
  pinned?: boolean;
}

export interface SplitPlanInput {
  routeId: string;
  routeApi: string | undefined;
  models: StoredModel[];
  moves: Record<string, ProtocolMove>;
  /** Protocols the installed adapter actually implements. */
  supportedProtocols?: string[];
  suggest: (modelId: string) => Protocol;
  compatFor: (modelId: string, protocol: Protocol) => ModelCapability["compat"];
}

export interface SplitPlan {
  /** Models that stay on the provider route. */
  stay: StoredModel[];
  /** shard id → models to place there (auto-matched only). */
  shards: Record<string, StoredModel[]>;
  moves: Record<string, ProtocolMove>;
  /** shard id → protocol, for creating a missing shard route. */
  shardProtocols: Record<string, Protocol>;
}

/**
 * Decide, for one route's freshly matched models, which stay and which belong
 * on a protocol shard. Pins win; unsupported protocols fall back to staying.
 * Auto moves that no longer apply (model gone, family now matches) are dropped.
 */
export function planProtocolSplit(input: SplitPlanInput): SplitPlan {
  const { routeId, routeApi, models, supportedProtocols, suggest, compatFor } = input;
  const moves: Record<string, ProtocolMove> = { ...input.moves };
  const stay: StoredModel[] = [];
  const shards: Record<string, StoredModel[]> = {};
  const shardProtocols: Record<string, Protocol> = {};
  const assigned = new Set<string>();

  for (const model of models) {
    if (moves[`${routeId}/${model.id}`]?.pinned) { stay.push(model); continue; }
    const target = suggest(model.id);
    if (target === routeApi || (supportedProtocols && !supportedProtocols.includes(target))) {
      stay.push(model);
      continue;
    }
    const shardId = `${routeId}-${target}`;
    const targetCompat = compatFor(model.id, target) ?? {};
    // Target-protocol defaults win, and a thinkingFormat the target protocol
    // does not speak (anthropic/gemini carry thinking natively) is dropped so a
    // completions-only setting cannot leak across the split.
    const compat = { ...(model.compat ?? {}), ...targetCompat };
    if (targetCompat.thinkingFormat === undefined) delete compat.thinkingFormat;
    const carried: StoredModel = { ...model, compat };
    shards[shardId] = [...(shards[shardId] ?? []), carried];
    shardProtocols[shardId] = target;
    moves[`${routeId}/${model.id}`] = { to: shardId, protocol: target, auto: true };
    assigned.add(model.id);
  }

  // Forget auto moves that no longer hold (renamed/removed model, or the family
  // heuristic now agrees with the route protocol).
  for (const key of Object.keys(moves)) {
    if (!key.startsWith(`${routeId}/`)) continue;
    if (moves[key].auto === true && !assigned.has(key.slice(routeId.length + 1))) delete moves[key];
  }

  return { stay, shards, moves, shardProtocols };
}

/**
 * Base URL a protocol shard must use. Most pi-ai clients append their own path
 * to the route base (responses → /responses, completions → /chat/completions),
 * so the route base is kept as-is; the Anthropic SDK instead always prefixes
 * /v1, so a base that already ends in /v1 must be trimmed or the request lands
 * on /v1/v1/messages.
 */
export function shardBaseURL(protocol: Protocol | string, baseURL: string | undefined): string | undefined {
  if (!baseURL) return baseURL;
  const trimmed = baseURL.replace(/\/+$/, "");
  if (protocol === "anthropic-messages") return trimmed.replace(/\/v1$/i, "");
  return trimmed;
}
