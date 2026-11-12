/**
 * Shared types for dsh-model-pilot.
 *
 * The DSH service seams are described here as minimal structural interfaces
 * rather than imported from `@deepseek-ai/*` type packages. This keeps the
 * plugin buildable without pinning the whole harness type surface and makes
 * version drift a runtime seam-check concern (see index.ts) instead of a
 * compile-time coupling.
 */

/** Wire protocols a provider route can speak. One route = one protocol. */
export type Protocol =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini";

export const PROTOCOLS: readonly Protocol[] = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "gemini",
];

/** Input modalities a model accepts. */
export type Modality = "text" | "image" | "audio" | "video" | "pdf";

/**
 * A reasoning effort map: offered level -> wire spelling (or null for a level
 * that maps to "no thinking"). Mirrors pi-ai's `reasoningEfforts` config field.
 */
export type ReasoningEfforts = Record<string, string | null>;

/** Per-model compat flags we may set. Subset of pi-ai's compatProfile. */
export interface ModelCompat {
  thinkingFormat?: string;
  supportsReasoningEffort?: boolean;
  supportsDeveloperRole?: boolean;
  requiresReasoningContentOnAssistantMessages?: boolean;
  maxTokensField?: string;
  forceAdaptiveThinking?: boolean;
  supportsTemperature?: boolean;
  [key: string]: unknown;
}

/** The capability facts we match for one model id. */
export interface ModelCapability {
  contextWindow?: number;
  maxTokens?: number;
  input?: Modality[];
  reasoningEfforts?: ReasoningEfforts | false;
  compat?: ModelCompat;
}

/** Where a matched capability came from, for confidence + UI attribution. */
export type CapabilitySource = "pi-ai-catalog" | "models.dev" | "endpoint" | "family-default";

export interface MatchResult {
  id: string;
  name: string;
  capability: ModelCapability;
  /** 0..1, how much we trust the matched capability. */
  confidence: number;
  sources: CapabilitySource[];
  /** Catalog provider ids that described this model (attribution). */
  matchedProviders: string[];
  /** Protocol suggested by family heuristics (route may override). */
  suggestedProtocol: Protocol;
  /** The base model id used for catalog matching, when the raw id missed. */
  baseIdUsed?: string;
}

/** Per-model match attribution persisted to the UI (source + confidence). */
export interface MatchInfo {
  sources: CapabilitySource[];
  confidence: number;
  baseIdUsed?: string;
}

/** A provider route as stored in llm-pi-ai.providers.<route>. */
export interface ProviderRoute {
  displayName?: string;
  api?: Protocol;
  baseURL?: string;
  apiKeyEnv?: string;
  models?: StoredModel[];
  modelOverrides?: Record<string, Partial<ModelCapability>>;
  defaultContextWindow?: number;
  defaultMaxTokens?: number;
  defaultInput?: Modality[];
  [key: string]: unknown;
}

/** Per-route map of model id -> match attribution, persisted for the UI. */
export type MatchInfoMap = Record<string, Record<string, MatchInfo>>;

/** A model entry as stored in a route's models[] array. */
export interface StoredModel extends ModelCapability {
  id: string;
  name?: string;
  /** Plugin bookkeeping (stripped before write if the schema rejects it). */
  [key: string]: unknown;
}

/** One upstream listing row (from discoverModels or our Gemini fetcher). */
export interface ListingRow {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  inputModalities?: Modality[];
}

/** A backup snapshot of the llm-pi-ai providers section. */
export interface Backup {
  id: string;
  createdAt: number;
  reason: string;
  /** Full providers dict at backup time. */
  providers: Record<string, ProviderRoute>;
}

/** Minimal structural view of the settings service (ctx.settings). */
export interface SettingsSeam {
  describe(options?: { redactSecrets?: boolean }): SettingsDescriptor[];
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>;
  replace(ns: string, section: object, expectedRevision?: number): Promise<void>;
}

export interface SettingsDescriptor {
  ns: string;
  value: unknown;
  user?: unknown;
  base?: unknown;
  revision: number;
  schema?: unknown;
}

/** Minimal structural view of the llm service discovery seam (ctx.llm). */
export interface LlmSeam {
  discoverModels(
    settingsNs: string,
    request: { provider?: string; baseURL?: string; api?: string; apiKey?: string },
    signal?: AbortSignal,
  ): Promise<ListingRow[]>;
}

/** Minimal structural view of the credentials service (ctx.credentials). */
export interface CredentialsSeam {
  resolve(ref: string): Promise<{ value: string; source: string } | undefined>;
  set(ref: string, value: string): Promise<void>;
  unset(ref: string): Promise<void>;
  describe(ref: string): Promise<{ configured: boolean; source?: string; writable: boolean }>;
}

/** Plugin global options, stored in the plugin's own settings namespace. */
export interface PilotOptions {
  /** Routes included in one-click refresh; empty = all llm-pi-ai routes. */
  managedRoutes: string[];
  /** Capability source order. */
  sourcePriority: CapabilitySource[];
  /** Whether family-level live probing is allowed (M2). */
  probeEnabled: boolean;
  /** Whether to remove models no longer advertised upstream. Default true —
   * stale models clutter the picker and mislead about what is available. */
  deleteSync: boolean;
  /** Auto refresh on a timer. */
  autoRefresh: boolean;
  refreshIntervalHours: number;
  /** How many backup snapshots to keep. */
  backupKeep: number;
}

export const DEFAULT_OPTIONS: PilotOptions = {
  managedRoutes: [],
  sourcePriority: ["models.dev", "pi-ai-catalog", "endpoint", "family-default"],
  probeEnabled: false,
  deleteSync: true,
  autoRefresh: false,
  refreshIntervalHours: 24,
  backupKeep: 10,
};