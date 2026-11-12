import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("lib", { recursive: true });

const result = await build({
  entryPoints: ["src/client/index.tsx"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  // Classic JSX so the only runtime require is "react" (provided by the loader).
  jsx: "transform",
  jsxFactory: "React.createElement",
  jsxFragment: "React.Fragment",
  external: ["react", "react-dom"],
  write: false,
  sourcemap: false,
  logLevel: "info",
});

const code = result.outputFiles[0].text;
const wrapped = `window.__ModuleLoader__.load({
\tid: "dsh-model-pilot",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${code}
\t\treturn module.exports;
\t}
});
`;

writeFileSync("lib/client.js", wrapped, "utf8");
console.log("client built -> lib/client.js");