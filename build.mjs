// Builds the script-tag bundle: dist/decap-cms-widget-openmarkdown.js plus
// lazily loaded chunks (Temml, Mermaid, code-block languages). It is an ES
// module with code splitting, so load it with <script type="module">.
//   node build.mjs                 main entry (Temml + Mermaid), highlighted code
//   node build.mjs --no-diagrams   /no-diagrams entry: no Mermaid chunks
//   node build.mjs --browser       the package's prebuilt one-file build
//                                  (@openmarkdown-dev/editor/browser): one output
//                                  file, no diagrams, no code highlighting
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { readFileSync, rmSync } from "node:fs";

const outdir = "dist";
rmSync(outdir, { recursive: true, force: true });
const noDiagrams = process.argv.includes("--no-diagrams");
const browser = process.argv.includes("--browser");

const result = await build({
  entryPoints: { "decap-cms-widget-openmarkdown": "src/script.js" },
  bundle: true,
  format: "esm",
  splitting: true,
  outdir,
  chunkNames: "chunks/[name]-[hash]",
  target: "es2022",
  minify: true,
  legalComments: "eof",
  metafile: true,
  logLevel: "warning",
  alias: browser
    ? { "@openmarkdown-dev/editor": "@openmarkdown-dev/editor/browser", "@codemirror/language-data": "./src/no-code-languages.js" }
    : noDiagrams ? { "@openmarkdown-dev/editor": "@openmarkdown-dev/editor/no-diagrams" } : {},
});

let total = 0, totalGz = 0;
const rows = [];
for (const [file, info] of Object.entries(result.metafile.outputs)) {
  const gz = gzipSync(readFileSync(file)).length;
  total += info.bytes; totalGz += gz;
  rows.push([file, info.bytes, gz, info.entryPoint ? "entry" : ""]);
}
rows.sort((a, b) => b[1] - a[1]);
const kb = (n) => (n / 1024).toFixed(1) + " KB";
// First load = the entry plus every chunk it reaches through static imports.
const entryFile = `${outdir}/decap-cms-widget-openmarkdown.js`;
const seen = new Set();
const walk = (f) => {
  if (seen.has(f)) return;
  seen.add(f);
  for (const imp of result.metafile.outputs[f].imports) if (imp.kind === "import-statement") walk(imp.path);
};
walk(entryFile);
let first = 0, firstGz = 0;
for (const f of seen) { first += result.metafile.outputs[f].bytes; firstGz += gzipSync(readFileSync(f)).length; }
console.log(`first load (${seen.size} files): ${kb(first)} min, ${kb(firstGz)} gz`);
console.log(`all ${rows.length} files: ${kb(total)} min, ${kb(totalGz)} gz`);
for (const r of rows.slice(0, 8)) console.log(`  ${r[0]}  ${kb(r[1])} / ${kb(r[2])} gz`);
