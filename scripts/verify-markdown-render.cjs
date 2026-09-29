/**
 * ESTINAD Central has no test runner, so this is the one automated check for
 * the long-description editor: it extracts the REAL source of the parser, the
 * inline renderer and the caret transforms, transpiles them with the repo's own
 * TypeScript, and exercises them through `react-dom/server`.
 *
 * What it protects:
 *  - `![alt](url)` renders as an image in the preview (and links/formatting
 *    still work after the shared `INLINE_RE` changed);
 *  - `javascript:` / `data:` URLs never reach `src`/`href`;
 *  - the caret math in `insertImage` (the picker and the toolbar both rely on
 *    it placing the cursor inside the URL).
 *
 * Run with `npm run verify:markdown`.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function slice(file, from, to) {
  const src = read(file);
  const start = src.indexOf(from);
  if (start === -1) throw new Error(`start not found in ${file}: ${from}`);
  const end = to ? src.indexOf(to, start) : src.length;
  if (end === -1) throw new Error(`end not found in ${file}: ${to}`);
  return src.slice(start, end);
}

function load(sources) {
  const js = ts.transpileModule(sources.join("\n"), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(require, mod, mod.exports);
  return mod.exports;
}

const editor = "components/ui/markdown-editor.tsx";
const markdown = "lib/markdown.ts";

const { MarkdownView, renderInline } = load([
  slice(markdown, "const HEADING_RE"), // block parser + its regexes
  slice(editor, "const INLINE_RE", "export function MarkdownView"),
  slice(editor, "export function MarkdownView", "function ToolButton"),
  `module.exports.MarkdownView = MarkdownView;
   module.exports.renderInline = renderInline;`,
]);

const { insertImage } = load([
  slice(markdown, "export function insertImage", "export type MdBlock"),
  "module.exports.insertImage = insertImage;",
]);

const BUCKET =
  "https://zhfietudqhbjuqjqfvpa.supabase.co/storage/v1/object/public/product-media/a/b/x.png";

const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);

/* ---------- rendering ---------- */

const html = renderToStaticMarkup(
  React.createElement(MarkdownView, {
    text: [
      "## Détails",
      "",
      `![Miel de Jujubier](${BUCKET})`,
      "",
      "Voir ![ici](https://x.test/inline.png) pour plus de détails.",
      "",
      "- ![Liste](/images/list.png)",
      "- [Documentation](https://suqya.dz/page)",
      "",
      "![evil](javascript:alert(1))",
      "![data](data:image/png;base64,AAAA)",
    ].join("\n"),
  }),
);

check("absolute image renders", html.includes(`<img src="${BUCKET}" alt="Miel de Jujubier"`));
check("inline image renders", html.includes('<img src="https://x.test/inline.png" alt="ici"'));
check("relative image renders", html.includes('<img src="/images/list.png" alt="Liste"'));
check("link still renders", html.includes('<a href="https://suqya.dz/page"'));
check("heading still renders", html.includes("<h3"));
check("javascript: image not rendered", !html.includes('src="javascript:'));
check("data: image not rendered", !html.includes('src="data:'));
check("rejected image stays literal", html.includes("![evil](javascript:alert(1))"));

const regression = renderToStaticMarkup(
  React.createElement(MarkdownView, { text: "**bold** *italic* `code`" }),
);
check(
  "bold/italic/code unaffected",
  regression.includes("<strong") && regression.includes("<em") && regression.includes("<code"),
);

/* ---------- inline parsing ---------- */

const inline = (text) => {
  const nodes = renderInline(text);
  return nodes
    .map((node) =>
      React.isValidElement(node)
        ? `${String(node.type)}:${JSON.stringify(node.props)}`
        : String(node),
    )
    .join("|");
};

check(
  "image alt and src survive parsing",
  inline(`![A](${BUCKET})`).includes(BUCKET) && inline(`![A](${BUCKET})`).includes('"A"'),
);
check("plain text has no node", inline("just text") === "just text");

/* ---------- caret math ---------- */

const empty = insertImage("", 0, 0);
check("insertImage inserts placeholder", empty.text === "![image](https://)");
check(
  "insertImage selects the URL",
  empty.text.slice(empty.selectionStart, empty.selectionEnd) === "https://",
);

const appended = insertImage("hello", 5, 5);
check("insertImage appends at caret", appended.text === "hello![image](https://)");
check(
  "insertImage keeps URL selected after caret",
  appended.text.slice(appended.selectionStart, appended.selectionEnd) === "https://",
);

const picked = insertImage("", 0, 0, "https://x/y.png", "Miel");
check(
  "insertImage uses picker url/alt",
  picked.text === "![Miel](https://x/y.png)" &&
    picked.text.slice(picked.selectionStart, picked.selectionEnd) === "https://x/y.png",
);

const selected = insertImage("replace me", 0, 10, "https://x/y.png", "Alt");
check("selection becomes the alt text", selected.text === "![replace me](https://x/y.png)");

/* ---------- report ---------- */

let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
