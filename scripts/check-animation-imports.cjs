#!/usr/bin/env bun
const fs = require("node:fs"),
  path = require("node:path");
function roots() {
  return [
    path.join(process.cwd(), "src", "components"),
    path.join(process.cwd(), "src", "app", "[locale]"),
    path.join(process.cwd(), "apps", "web", "src", "components"),
    path.join(process.cwd(), "apps", "web", "src", "app", "[locale]"),
  ].filter(fs.existsSync);
}
const EXT = /\.(tsx|ts|jsx|js)$/;
const PATTERNS = [
  /initial=\{\{\s*opacity\s*:\s*0\s*,\s*y\s*:\s*\d+\s*\}\}/,
  /animate=\{\{\s*opacity\s*:\s*1\s*,\s*y\s*:\s*0\s*\}\}/,
];
const EXCEPT = new Set(["src/lib/animations.ts", "apps/web/src/lib/animations.ts"]);
function shouldSkip(fp) {
  const n = path.relative(process.cwd(), fp).replaceAll("\\", "/");
  if (EXCEPT.has(n)) return true;
  if (n.endsWith(".test.tsx") || n.endsWith(".test.ts")) return true;
  return false;
}
function collect(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.isFile() && EXT.test(e.name)) out.push(p);
  }
}
function hasImport(c) {
  return /from\s+["']@\/lib\/animations["']/.test(c);
}
function findInline(c) {
  for (const p of PATTERNS) {
    const m = p.exec(c);
    if (m) return m[0];
  }
  return null;
}
function main() {
  const rootsList = roots();
  if (rootsList.length === 0) {
    console.log("Animation imports check passed.");
    return;
  }
  const files = [];
  for (const d of rootsList) collect(d, files);
  const viol = [];
  for (const fp of files) {
    if (shouldSkip(fp)) continue;
    const c = fs.readFileSync(fp, "utf8");
    if (hasImport(c)) continue;
    const inl = findInline(c);
    if (!inl) continue;
    const lines = c.split(/\r?\n/);
    let ln = 1;
    for (let i = 0; i < lines.length; i++)
      if (lines[i].includes(inl.slice(0, 20))) {
        ln = i + 1;
        break;
      }
    viol.push({
      file: path.relative(process.cwd(), fp).replaceAll("\\", "/"),
      line: ln,
      snippet: inl.slice(0, 60),
    });
  }
  if (viol.length === 0) {
    console.log("Animation imports check passed.");
    return;
  }
  console.error("Animation violations (use @/lib/animations reveal instead of inline):");
  for (const v of viol) console.error(`  ${v.file}:${v.line} ${v.snippet}`);
  process.exit(1);
}
main();
