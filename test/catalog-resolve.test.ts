import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPiAiCatalog, lookupCatalog, resolvePiAiCatalogPath } from "../src/catalog.js";

/**
 * Regression guard for the runtime catalog resolution bug: on a global DSH
 * install the node binary lives outside the DSH prefix (e.g. /usr/bin/node), so
 * the execPath-derived global prefix points at the wrong tree, and pi-ai is
 * ESM-only (its exports map has no `require` condition) so require.resolve of
 * the catalog subpath throws. The resolver must anchor on the launcher script
 * (process.argv[1] = <prefix>/bin/dsh) and probe the dist file on disk.
 *
 * We build a synthetic install tree and spoof argv[1] (priority-1 anchor) so the
 * assertion is deterministic regardless of the host's real DSH layout.
 */
describe("pi-ai catalog runtime resolution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
  });

  function syntheticInstall(): { prefix: string; catalogPath: string } {
    const prefix = mkdtempSync(join(tmpdir(), "dsh-pilot-catalog-"));
    cleanups.push(() => rmSync(prefix, { recursive: true, force: true }));
    // Launcher script: <prefix>/bin/dsh
    const binDir = join(prefix, "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "dsh"), "#!/usr/bin/env node\n");
    // Catalog hoisted as a sibling of the adapter under the DSH core node_modules.
    const piAiDir = join(prefix, "lib", "node_modules", "@deepseek-ai", "dsh", "node_modules", "@earendil-works", "pi-ai");
    const distDir = join(piAiDir, "dist", "providers");
    mkdirSync(distDir, { recursive: true });
    writeFileSync(join(piAiDir, "package.json"), JSON.stringify({ name: "@earendil-works/pi-ai", version: "0.0.0-test", type: "module" }));
    const catalogPath = join(distDir, "all.js");
    writeFileSync(
      catalogPath,
      [
        "export function getBuiltinProviders() { return ['testprov']; }",
        "export function getBuiltinModels() { return [{ id: 'test-model', contextWindow: 12345, input: ['text', 'image'], thinkingLevelMap: { off: null, low: 'low', high: 'high' } }]; }",
        "export function getBuiltinModelDataGeneratedAt() { return 1700000000000; }",
      ].join("\n"),
    );
    return { prefix, catalogPath };
  }

  it("anchors on the launcher script and loads the nested ESM catalog", async () => {
    const { prefix, catalogPath } = syntheticInstall();
    const originalArgv1 = process.argv[1];
    process.argv[1] = join(prefix, "bin", "dsh");
    cleanups.push(() => {
      process.argv[1] = originalArgv1;
    });
    try {
      const resolved = resolvePiAiCatalogPath();
      expect(resolved).toBe(catalogPath);
      const index = await loadPiAiCatalog();
      expect(index).toBeDefined();
      expect(index!.providers).toEqual(["testprov"]);
      expect(index!.modelCount).toBe(1);
      expect(index!.generatedAt).toBe(1700000000000);
      const entries = lookupCatalog(index!, "test-model");
      expect(entries).toHaveLength(1);
      expect(entries[0].contextWindow).toBe(12345);
      expect(entries[0].thinkingLevelMap).toEqual({ off: null, low: "low", high: "high" });
    } finally {
      process.argv[1] = originalArgv1;
    }
  });
});