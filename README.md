# dsh-model-pilot

> Smart model configuration for DeepSeek Harness (DSH). Add a gateway baseURL + key, pull the upstream model list, auto-match **wire protocol / context window / multimodal capabilities / reasoning effort** per model, and silently write it into the official Models page. One-click refresh, per-model overrides, backup and rollback.

> Personal-use plugin, AI-assisted. Back up your config before use.

[中文](./README.zh.md) · Compatibility matrix & seam self-check: [docs/compatibility-notes.md](./docs/compatibility-notes.md)

## Why

Hand-writing DSH's `cordis.patch.yml` model config is error-prone: inflated context/output limits, reasoning levels the upstream doesn't offer (silently fitted by the gateway), missing/wrong `thinkingFormat`, dead entries for renamed/retired models, and missing multimodal flags. dsh-model-pilot delegates all of that to a **multi-source capability matcher** — pi-ai's installed catalog (primary), models.dev (secondary), family defaults (fallback) — producing a confidence-scored, source-attributed capability set per standard model id, then writing it into the official config. You just supply a baseURL and a key.

## Features

- **Provider management**: add/edit/remove gateway routes (baseURL, display name, protocol, key). Keys live in the DSH credential store; config holds only a reference and the key never reaches the browser.
- **One-click refresh**: pull upstream `/models` (or native Gemini listing) → match capabilities → write the whole `llm-pi-ai.providers.<route>` section. The official model selector picks it up immediately.
- **Smart matching**: protocol (route config wins, family heuristics otherwise); capabilities (pi-ai catalog > models.dev > family defaults); reasoning ladder from the catalog `thinkingLevelMap`; `thinkingFormat` by family (deepseek/zai/qwen/openai).
- **Per-model overrides**: edit any model's context/limits/modalities/efforts/thinkingFormat; preserved across refreshes.
- **Safe writes**: snapshot before every write, optimistic-revision retry, unknown-compat-key stripping against the live schema, read-back verification.
- **Backup & rollback**: keep the last N snapshots, restore in one click.
- **Reachability probe** (opt-in): one tiny `max_tokens=1` request per protocol.
- **Standalone settings page** via the official `settings.section` slot — no DOM injection. English + Chinese.

## Install

```bash
dsh plugin --profile web add @huakirax/model-pilot
# or pin a version
dsh plugin --profile web add @huakirax/model-pilot@0.1.0
```

Restart DSH, then open **Settings → Model Pilot**. Requires DSH ≥ 0.2.2-rc.1; the plugin self-checks its seams at boot and degrades with a visible notice instead of crashing the profile.

## Usage

1. **Add provider**: route id (e.g. `completions`), baseURL (e.g. `https://your-gateway/v1`), protocol, API key.
2. **Refresh**: per-card or "Refresh all". Pulls the upstream list, matches capabilities, writes config.
3. **Inspect / override**: expand the model table; click "Override" to correct any field.
4. **Options**: remove retired models (default off — marks them stale), auto-refresh interval, backups to keep.
5. **Rollback**: restore a prior snapshot if a write goes wrong.

## How it works

```
settings page (baseURL + key)
  → host-side listing (pi-ai discoverModels: completions/responses/anthropic; Gemini custom)
  → capability match (pi-ai catalog > models.dev > family defaults; confidence + source)
  → protocol routing (route.api wins, family heuristic fallback)
  → silent write ctx.settings.replace("llm-pi-ai", {providers})
      snapshot + revision retry + strip unknown compat keys + read-back
  → official model selector
```

The write target is the official `llm-pi-ai.providers.<route>`, so the native Models page/selector sees it and it survives restarts. **Capability matching never rewrites a baseURL/endpoint** — protocol is a route property; the matcher only takes model-intrinsic facts (window/limits/modalities/efforts). Standard model ids are assumed (normalize trim/case + strip `auto/`-style routing prefixes); align ids in your gateway for best results.

## Security & privacy

- Keys are stored/resolved via `ctx.credentials`; config keeps only `apiKeyEnv`; the UI shows set/unset, never the value.
- All upstream requests run host-side; the browser only calls same-origin `/api/dsh-model-pilot/*` (owner-only auth).
- Every write snapshots `providers` (last N kept, default 10) for one-click rollback.
- The models.dev cache holds only public capability data, no secrets.

## Version compatibility

DSH seams drift across versions. The plugin uses **dynamic detection + boot self-check**: protocols are read from the installed adapter's schema (**0.2.2-rc.1 ships 3 protocols, no gemini**; Gemini is implemented and activates automatically once DSH supports it), unknown compat keys are stripped against the live schema, and the catalog is resolved from the installed adapter's own node_modules. Full matrix: [docs/compatibility-notes.md](./docs/compatibility-notes.md).

## Development

```bash
pnpm install
pnpm test          # vitest: unit + integration (integration uses the real pi-ai catalog)
pnpm typecheck     # tsc --noEmit
pnpm build         # esbuild -> lib/index.js (host) + lib/client.js (browser)
```

## License

MIT © Huakira