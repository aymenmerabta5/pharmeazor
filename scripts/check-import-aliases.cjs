#!/usr/bin/env bun
const fs = require("node:fs"),
  path = require("node:path");
const { moduleReferences, parseOwned, positionOf, relative } = require("./lib/oxc.cjs");
function roots() {
  const cands = [path.join(process.cwd(), "src"), path.join(process.cwd(), "apps", "web", "src")];
  return cands.filter(fs.existsSync);
}
const TARGET = new Set([".ts", ".tsx"]);
const STYLE = [".css", ".scss", ".sass", ".less"];
function list(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p, out);
    else if (e.isFile() && TARGET.has(path.extname(e.name))) out.push(p);
  }
  return out;
}
function isRel(s) {
  return s.startsWith("./") || s.startsWith("../");
}
function isStyle(s) {
  return STYLE.some((e) => s.endsWith(e));
}
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel));
}
function isGeneratedConvexTarget(target) {
  return isInside(path.join(process.cwd(), "convex", "_generated"), target);
}
function main() {
  const dirs = roots();
  if (dirs.length === 0) {
    console.error("Missing src root");
    process.exit(1);
  }
  const viol = [];
  for (const root of dirs) {
    for (const fp of list(root)) {
      const source = fs.readFileSync(fp, "utf8");
      const program = parseOwned(fp, source);
      for (const reference of moduleReferences(program)) {
        if (!isRel(reference.specifier) || isStyle(reference.specifier)) continue;
        const target = path.resolve(path.dirname(fp), reference.specifier);
        if (isInside(root, target) || isGeneratedConvexTarget(target)) continue;
        const { line, column } = positionOf(source, reference.node);
        viol.push({ file: relative(fp), line, column, spec: JSON.stringify(reference.specifier) });
      }
    }
  }
  if (viol.length === 0) {
    console.log("Import boundary check passed.");
    return;
  }
  console.error(
    "Relative imports may not escape their source root. Use @/ or @repo/* aliases (styles and root convex/_generated targets exempt):",
  );
  for (const v of viol) console.error(`${v.file}:${v.line}:${v.column} ${v.spec}`);
  process.exit(1);
}
try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
