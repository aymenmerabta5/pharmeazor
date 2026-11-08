#!/usr/bin/env bun
const fs = require("node:fs"),
  path = require("node:path");
const {
  jsxAttributeString,
  jsxName,
  jsxOpenings,
  parseOwned,
  positionOf,
  relative,
} = require("./lib/oxc.cjs");
const EXT = new Set([".ts", ".tsx"]);
function list(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p, out);
    else if (e.isFile() && EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}
function main() {
  const appRoots = [
    path.join(process.cwd(), "src", "app"),
    path.join(process.cwd(), "apps", "web", "src", "app"),
  ].filter(fs.existsSync);
  if (appRoots.length === 0) {
    console.log("Next parity check passed (no app dir).");
    return;
  }
  const files = appRoots.flatMap((r) => list(r));
  const violations = [];
  for (const fp of files) {
    const source = fs.readFileSync(fp, "utf8");
    const program = parseOwned(fp, source);
    for (const opening of jsxOpenings(program)) {
      const tag = jsxName(opening.name);
      const { line, column } = positionOf(source, opening);
      if (tag === "img")
        violations.push({
          file: relative(fp),
          line,
          column,
          msg: "Use next/image <Image> instead of <img> for optimization",
        });
      if (tag === "a") {
        const href = jsxAttributeString(opening, "href");
        if (
          href &&
          href.startsWith("/") &&
          !href.startsWith("//") &&
          !fp.includes("global-error")
        ) {
          violations.push({
            file: relative(fp),
            line,
            column,
            msg: 'Use next/link instead of <a href="' + href + '"> for internal navigation',
          });
        }
      }
    }
  }
  if (violations.length === 0) {
    console.log("Next parity check passed.");
    return;
  }
  console.error("Next parity violations:");
  for (const v of violations) console.error(`  ${v.file}:${v.line}:${v.column} ${v.msg}`);
  process.exit(1);
}
try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
