/**
 * Throwaway verification harness (not part of the app).
 *
 * Extracts the REAL `parseMarkdown` from lib/markdown.ts and the REAL
 * `INLINE_RE` / `renderInline` / `MarkdownView` from
 * components/ui/markdown-editor.tsx, transpiles them with the repo's own
 * TypeScript, and renders through react-dom/server — so what we assert is the
 * shipped code path, not a re-typed copy.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = process.cwd();

function slice(file, fromNeedle, toNeedle) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const start = src.indexOf(fromNeedle);
  if (start === -1) throw new Error(`start not found in ${file}: ${fromNeedle}`);
  const end = toNeedle ? src.indexOf(toNeedle, start) : src.length;
  if (end === -1) throw new Error(`end not found in ${file}: ${toNeedle}`);
  return src.slice(start, end);
}

// parseMarkdown + its block regexes (everything after the caret transforms).
const parser = slice("lib/markdown.ts", "const HEADING_RE", null);
// inline renderer + the view component, straight out of the editor file.
const inline = slice("components/ui/markdown-editor.tsx", "const INLINE_RE", "function ToolButton");
const view = slice("components/ui/markdown-editor.tsx", "export function MarkdownView", "function ToolButton");

const combined = `${parser}\n${inline}\n${view}`;

const js = ts.transpileModule(combined, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
}).outputText;

const mod = { exports: {} };
new Function("require", "module", "exports", js)(require, mod, mod.exports);
const { MarkdownView } = mod.exports;
if (typeof MarkdownView !== "function") throw new Error("MarkdownView not exported");

const ABS =
  "https://zhfietudqhbjuqjqfvpa.supabase.co/storage/v1/object/public/product-media/a/b/x.png";

const sample = [
  "## Détails",
  "",
  `![Miel de Jujubier](${ABS})`,
  "",
  "Voir ![ici](https://x.test/inline.png) pour plus de détails.",
  "",
  "- ![Liste](/images/list.png)",
  "- [Documentation](https://suqya.dz/page)",
  "",
  "![evil](javascript:alert(1))",
].join("\n");

const html = renderToStaticMarkup(React.createElement(MarkdownView, { text: sample }));

const checks = [
  ["absolute image renders", html.includes(`<img src="${ABS}" alt="Miel de Jujubier"`)],
  ["inline image renders", html.includes('<img src="https://x.test/inline.png" alt="ici"')],
  ["relative image renders", html.includes('<img src="/images/list.png" alt="Liste"')],
  ["link renders", html.includes('<a href="https://suqya.dz/page"')],
  ["heading renders", html.includes("<h3")],
  ["strong renders", false], // filled below via dedicated case
  ["javascript: image NOT rendered", !html.includes('src="javascript:')],
  ["javascript: stays literal text", html.includes("![evil](javascript:alert(1))")],
];

// bold/italic/code regression check on a paragraph
const regression = renderToStaticMarkup(
  React.createElement(MarkdownView, { text: "**bold** *italic* `code`" }),
);
checks[5][1] = regression.includes("<strong") && regression.includes("<em") && regression.includes("<code");

console.log("=== rendered HTML ===\n" + html + "\n");
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? "\nALL CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
