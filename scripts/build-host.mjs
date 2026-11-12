import { build } from "esbuild";
import { rmSync, mkdirSync } from "node:fs";

mkdirSync("lib", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  // The harness provides these at runtime from the profile; never bundle them.
  external: ["@deepseek-ai/*", "react", "react-dom"],
  logLevel: "info",
});

console.log("host built -> lib/index.js");