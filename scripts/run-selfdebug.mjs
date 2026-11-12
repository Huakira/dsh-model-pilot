import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const outfile = ".selfdebug.bundle.mjs";
await build({
  entryPoints: ["scripts/selfdebug.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["@deepseek-ai/*", "react", "react-dom", "node:sqlite"],
  logLevel: "warning",
});
const res = spawnSync(process.execPath, [outfile], { stdio: "inherit", cwd: process.cwd() });
rmSync(outfile, { force: true });
process.exit(res.status ?? 1);