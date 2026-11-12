/**
 * Safe writer for the llm-pi-ai providers section.
 *
 * Guarantees: snapshot before every write (persisted undo stack), optimistic
 * revision retry on conflict, unknown-compat-key stripping against the live
 * schema (version gating), and read-back verification after the write.
 * Never touches baseURL/endpoint fields — callers pass complete route profiles.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Backup,
  ModelCompat,
  ProviderRoute,
  SettingsDescriptor,
  SettingsSeam,
} from "./types.js";

export const PI_AI_NS = "llm-pi-ai";

export class SettingsConflict extends Error {
  constructor(public expected: number, public actual: number) {
    super(`settings conflict: expected revision ${expected}, actual ${actual}`);
    this.name = "SettingsConflict";
  }
}

function isConflict(error: unknown): error is { expected: number; actual: number } {
  const e = error as { code?: string; expected?: number; actual?: number };
  return e?.code === "SETTINGS_CONFLICT" && typeof e.expected === "number" && typeof e.actual === "number";
}

/** Read the providers dict from the live llm-pi-ai descriptor. */
export function readProviders(settings: SettingsSeam): { providers: Record<string, ProviderRoute>; revision: number } {
  const descriptor = settings.describe().find((d) => d.ns === PI_AI_NS);
  if (!descriptor) throw new Error(`no configurable plugin entry "${PI_AI_NS}"`);
  const value = descriptor.value as { providers?: Record<string, ProviderRoute> } | undefined;
  return { providers: structuredClone(value?.providers ?? {}), revision: descriptor.revision };
}

/**
 * Collect every compat field key the live schema accepts. Walks the schemastery
 * ref graph and unions the dict keys of any object node that looks like a compat
 * profile (has the signature `thinkingFormat` field). Returns undefined when the
 * schema cannot be introspected (caller then writes as-is).
 */
export function extractCompatKeys(schema: unknown): Set<string> | undefined {
  const root = schema as { uid?: number; refs?: Record<string, SchemaNode> } | undefined;
  if (!root?.refs || root.uid === undefined) return undefined;
  const refs = root.refs;
  const keys = new Set<string>();
  let found = false;
  for (const node of Object.values(refs)) {
    if (node?.type === "object" && node.dict && "thinkingFormat" in node.dict) {
      found = true;
      for (const key of Object.keys(node.dict)) keys.add(key);
    }
  }
  return found ? keys : undefined;
}

interface SchemaNode {
  type?: string;
  dict?: Record<string, number>;
  inner?: number;
  list?: number[];
  value?: unknown;
}

/**
 * Read the wire protocols the installed adapter accepts, from the `api` field
 * of any provider-profile object in the schema. Returns undefined when the
 * schema cannot be introspected. This is how the plugin adapts to the installed
 * DSH version (e.g. 0.2.2-rc.1 ships 3 protocols; gemini arrives in a later one).
 */
export function extractSupportedProtocols(schema: unknown): string[] | undefined {
  const root = schema as { uid?: number; refs?: Record<string, SchemaNode> } | undefined;
  if (!root?.refs || root.uid === undefined) return undefined;
  const refs = root.refs;
  const protocols = new Set<string>();
  let found = false;
  const collectConsts = (nodeId: number): void => {
    const node = refs[String(nodeId)];
    if (!node) return;
    if (node.type === "const" && typeof node.value === "string") protocols.add(node.value);
    else if (node.type === "union" && Array.isArray(node.list)) for (const id of node.list) collectConsts(id);
  };
  for (const node of Object.values(refs)) {
    if (node?.type === "object" && node.dict && "api" in node.dict) {
      found = true;
      collectConsts(node.dict.api);
    }
  }
  return found ? [...protocols] : undefined;
}

/** Deep-clone providers, dropping compat keys the live schema does not accept. */
export function stripUnknownCompat(
  providers: Record<string, ProviderRoute>,
  allowed: Set<string>,
): { providers: Record<string, ProviderRoute>; stripped: string[] } {
  const stripped: string[] = [];
  const cleanCompat = (compat: unknown): ModelCompat => {
    if (!compat || typeof compat !== "object") return compat as ModelCompat;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(compat as Record<string, unknown>)) {
      if (allowed.has(key)) out[key] = value;
      else if (!stripped.includes(key)) stripped.push(key);
    }
    return out as ModelCompat;
  };
  const next: Record<string, ProviderRoute> = {};
  for (const [route, profile] of Object.entries(providers)) {
    const p: ProviderRoute = { ...profile };
    if (p.compat) p.compat = cleanCompat(p.compat) as ProviderRoute["compat"];
    if (Array.isArray(p.models)) {
      p.models = p.models.map((m) => (m.compat ? { ...m, compat: cleanCompat(m.compat) } : m));
    }
    if (p.modelOverrides) {
      const mo: Record<string, unknown> = {};
      for (const [id, override] of Object.entries(p.modelOverrides)) {
        const o = override as { compat?: unknown };
        mo[id] = o.compat ? { ...o, compat: cleanCompat(o.compat) } : override;
      }
      p.modelOverrides = mo as ProviderRoute["modelOverrides"];
    }
    next[route] = p;
  }
  return { providers: next, stripped };
}

export interface WriterOptions {
  /** File path for the persisted undo stack. */
  backupPath?: string;
  /** How many snapshots to keep. */
  backupKeep?: number;
  /** Max revision-conflict retries. */
  maxRetries?: number;
  /** Logger. */
  log?: (msg: string) => void;
}

export class Writer {
  private backups: Backup[] = [];
  private readonly keep: number;
  private readonly maxRetries: number;
  private readonly log: (msg: string) => void;

  constructor(private settings: SettingsSeam, private opts: WriterOptions = {}) {
    this.keep = opts.backupKeep ?? 10;
    this.maxRetries = opts.maxRetries ?? 3;
    this.log = opts.log ?? (() => {});
    this.loadBackups();
  }

  private loadBackups(): void {
    const path = this.opts.backupPath;
    if (!path || !existsSync(path)) return;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Backup[];
      if (Array.isArray(parsed)) this.backups = parsed;
    } catch {
      this.backups = [];
    }
  }

  private persistBackups(): void {
    const path = this.opts.backupPath;
    if (!path) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(this.backups, null, 2), "utf8");
    } catch (error) {
      this.log(`failed to persist backups: ${String(error)}`);
    }
  }

  listBackups(): Backup[] {
    return [...this.backups].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Snapshot the current providers before a mutation. */
  snapshot(reason: string): Backup {
    const { providers } = readProviders(this.settings);
    const backup: Backup = {
      id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      reason,
      providers,
    };
    this.backups.push(backup);
    if (this.backups.length > this.keep) this.backups = this.backups.slice(-this.keep);
    this.persistBackups();
    return backup;
  }

  /**
   * Write a complete providers dict. Snapshots first, strips unknown compat
   * keys, retries on revision conflict, and reads back to verify.
   */
  async writeProviders(next: Record<string, ProviderRoute>, reason: string): Promise<{ stripped: string[] }> {
    this.snapshot(reason);
    const descriptor = this.settings.describe().find((d) => d.ns === PI_AI_NS);
    const allowed = extractCompatKeys(descriptor?.schema);
    let payload = next;
    let stripped: string[] = [];
    if (allowed) {
      const result = stripUnknownCompat(next, allowed);
      payload = result.providers;
      stripped = result.stripped;
      if (stripped.length > 0) this.log(`stripped unsupported compat keys: ${stripped.join(", ")}`);
    }

    let attempt = 0;
    for (;;) {
      const { revision } = readProviders(this.settings);
      try {
        // replace() resets the volatile providers section to exactly `payload`,
        // which is what we want for a full-section write (update() would merge
        // and could not remove routes).
        await this.settings.replace(PI_AI_NS, { providers: payload }, revision);
        break;
      } catch (error) {
        if (isConflict(error) && attempt < this.maxRetries) {
          attempt++;
          this.log(`revision conflict (expected ${error.expected}, actual ${error.actual}); retry ${attempt}`);
          continue;
        }
        throw error;
      }
    }

    // Read-back verification.
    const after = readProviders(this.settings);
    const expectedRoutes = Object.keys(payload).sort().join(",");
    const actualRoutes = Object.keys(after.providers).sort().join(",");
    if (expectedRoutes !== actualRoutes) {
      throw new Error(`read-back mismatch: wrote routes [${expectedRoutes}] but found [${actualRoutes}]`);
    }
    return { stripped };
  }

  /** Restore a backup snapshot by id. */
  async rollback(backupId: string): Promise<void> {
    const backup = this.backups.find((b) => b.id === backupId);
    if (!backup) throw new Error(`no backup "${backupId}"`);
    await this.writeProviders(backup.providers, `rollback to ${backup.id}`);
  }
}