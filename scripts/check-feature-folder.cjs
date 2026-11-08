#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");

function resolveRoots() {
  const candidates = [path.join(process.cwd(), "src"), path.join(process.cwd(), "app")];
  const apps = path.join(process.cwd(), "apps");
  if (fs.existsSync(apps)) {
    for (const entry of fs.readdirSync(apps, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(path.join(apps, entry.name, "src"), path.join(apps, entry.name, "app"));
    }
  }
  return candidates.filter((root) => fs.existsSync(root));
}

const MAX_STANDALONE_LINES = 150;
const MAX_ORCHESTRATOR_LINES = 120;
const MAX_SECTION_LINES = 200;

// Only intrinsic backend roots are outside the frontend size contract.
// Nested route/feature folders named server remain frontend sources.
function isIntrinsicServerRoot(fp) {
  const parts = path.relative(process.cwd(), fp).split(path.sep);
  return (
    (parts.length === 2 && parts[0] === "src" && parts[1] === "server") ||
    (parts.length === 4 && parts[0] === "apps" && parts[2] === "src" && parts[3] === "server")
  );
}

function listTsxFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!isIntrinsicServerRoot(fp)) listTsxFiles(fp, files);
      continue;
    }
    if (!e.isFile() || !e.name.endsWith(".tsx")) continue;
    if (e.name.endsWith(".test.tsx")) continue;
    files.push(fp);
  }
  return files;
}
function rel(p) {
  return p.replaceAll("\\", "/").replace(process.cwd().replaceAll("\\", "/") + "/", "");
}
function linesOf(fp) {
  return fs.readFileSync(fp, "utf8").split(/\r?\n/).length;
}
function isOrchestrator(fp) {
  const c = fs.readFileSync(fp, "utf8");
  return (
    (c.match(/import .*from.*_components/g) || []).length >= 3 ||
    /SearchFilters|Dashboard|View/.test(path.basename(fp))
  );
}
function physicalFileKey(fp) {
  const info = fs.statSync(fp, { bigint: true });
  if (info.ino !== 0n) return String(info.dev) + ":" + String(info.ino);
  const real = fs.realpathSync.native(fp);
  return process.platform === "win32" ? real.toLowerCase() : real;
}

function main() {
  const roots = resolveRoots();
  const discovered = roots.flatMap((root) => listTsxFiles(root));
  discovered.sort((left, right) => rel(left).localeCompare(rel(right)));
  const filesByPhysicalPath = new Map();
  for (const fp of discovered) {
    const key = physicalFileKey(fp);
    if (!filesByPhysicalPath.has(key)) filesByPhysicalPath.set(key, fp);
  }
  const files = [...filesByPhysicalPath.values()];
  if (files.length === 0) {
    console.log("feature-folder check passed (no files).");
    return;
  }
  const violations = [];
  for (const fp of files) {
    const loc = linesOf(fp);
    const isOrch = isOrchestrator(fp);
    const limit = isOrch ? MAX_ORCHESTRATOR_LINES : MAX_STANDALONE_LINES;
    // allow larger for page orchestrators with sections
    const effective = /page\.tsx$|layout\.tsx$/.test(fp) ? MAX_SECTION_LINES : limit;
    if (loc > effective) violations.push({ file: rel(fp), lines: loc, limit: effective });
  }
  if (violations.length === 0) {
    console.log("feature-folder check passed.");
    return;
  }
  console.error(
    "Feature-folder size violations (<150 standalone, <120 orchestrator, <200 section):",
  );
  for (const v of violations) console.error(`  ${v.file}: ${v.lines} lines (limit ${v.limit})`);
  process.exit(1);
}
main();
