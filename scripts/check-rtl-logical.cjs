#!/usr/bin/env bun
const fs = require("node:fs"),
  path = require("node:path");
const { parseOwned, positionOf, walk } = require("./lib/oxc.cjs");
const ROOTS = [
  "src/app",
  "src/routes",
  "src/components",
  "src/features",
  "src/renderer",
  "src/styles",
  "app",
  "apps/web/src/app",
  "apps/web/src/routes",
  "apps/web/src/components",
  "apps/web/src/features",
  "apps/web/src/styles",
  "apps/desktop/src/renderer",
  "apps/mobile/app",
  "apps/mobile/src",
  "packages/ui/src",
];
const FILES = ["global.css", "apps/mobile/global.css"];
const EXT = /\.(css|tsx|ts|jsx|js)$/;
const PHYSICAL_UTILITY =
  /(?:^|\s|["'\x60])((?:[^\s"'\x60]+:)*-?(?:text-(?:left|right)|border-(?:l|r)(?:-[^\s"'\x60]+)?|rounded-(?:l|r)(?:-[^\s"'\x60]+)?|(?:left|right|ml|mr|pl|pr)-[^\s"'\x60]+))(?=$|\s|["'\x60])/g;
const PHYSICAL_CSS =
  /(?:^|[;{]\s*)((?:(?:margin|padding|border)-(?:left|right)|left|right)\s*:|text-align\s*:\s*(?:left|right)(?=\s*[;}]))/g;
const PHYSICAL_STYLE_KEYS = new Set([
  "left",
  "right",
  "marginLeft",
  "marginRight",
  "paddingLeft",
  "paddingRight",
  "borderLeft",
  "borderRight",
]);
const REGISTERED_EXCEPTIONS = [
  {
    id: "base-ui-side-state",
    file: /(?:^|\/)components\/ui\/(?:dropdown-menu|hover-card|popover|tooltip)\.tsx$/,
    token:
      /^data-\[side=(?:left|right)\]:slide-in-from-(?:left|right)-(?:[0-9]+(?:\/[0-9]+)?|\[[^\]]+\])$/,
    reason: "Base UI collision-side state names are physical API values, not document alignment.",
  },
];
function roots() {
  return ROOTS.map((root) => path.join(process.cwd(), root)).filter(fs.existsSync);
}
function standaloneFiles() {
  return FILES.map((file) => path.join(process.cwd(), file)).filter(fs.existsSync);
}
function registeredException(file, token) {
  return REGISTERED_EXCEPTIONS.find((entry) => entry.file.test(file) && entry.token.test(token));
}
function collect(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.isFile() && EXT.test(e.name)) out.push(p);
  }
}
function matches(line, extension) {
  const found = [];
  PHYSICAL_UTILITY.lastIndex = 0;
  for (const match of line.matchAll(PHYSICAL_UTILITY))
    found.push({ kind: "utility", token: match[1] });
  if (extension === ".css") {
    PHYSICAL_CSS.lastIndex = 0;
    for (const match of line.matchAll(PHYSICAL_CSS))
      found.push({ kind: "css", token: match[1].trim() });
  }
  return found;
}
function styleKey(property) {
  const key = property.key;
  if (!property.computed && key?.type === "Identifier") return key.name;
  if (typeof key?.value === "string") return key.value;
  return key?.type === "TemplateLiteral" && key.expressions.length === 0
    ? key.quasis.map((part) => part.value.cooked ?? part.value.raw).join("")
    : null;
}
function styleMatches(file, source) {
  const found = [];
  walk(parseOwned(file, source, file.endsWith(".js") ? "jsx" : undefined), (node) => {
    if (node.type !== "ObjectExpression") return;
    for (const property of node.properties) {
      if (property.type !== "Property" || property.method || property.kind !== "init") continue;
      const key = styleKey(property);
      if (PHYSICAL_STYLE_KEYS.has(key))
        found.push({
          kind: "style",
          token: key + ":",
          line: positionOf(source, property.key).line,
        });
    }
  });
  return found;
}
function main() {
  const rootsList = roots();
  const files = standaloneFiles();
  if (rootsList.length === 0 && files.length === 0) {
    console.log("RTL logical check passed (no sources).");
    return;
  }
  for (const d of rootsList) collect(d, files);
  const viol = [];
  for (const fp of files) {
    const file = path.relative(process.cwd(), fp).replaceAll("\\", "/");
    const extension = path.extname(fp);
    const source = fs.readFileSync(fp, "utf8"),
      lines = source.split(/\r?\n/);
    if (extension !== ".css")
      for (const match of styleMatches(fp, source)) viol.push({ file, ...match });
    for (let i = 0; i < lines.length; i++)
      for (const match of matches(lines[i], extension)) {
        if (registeredException(file, match.token)) continue;
        viol.push({ file, line: i + 1, kind: match.kind, token: match.token });
      }
  }
  if (viol.length === 0) {
    console.log("RTL logical direction check passed.");
    return;
  }
  console.error("RTL violations (use start/end, text-start/end, ms/me, ps/pe, border-s/e):");
  for (const v of viol) console.error(`  ${v.file}:${v.line} [${v.kind}] ${v.token}`);
  process.exit(1);
}
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown parser failure");
  process.exit(2);
}
