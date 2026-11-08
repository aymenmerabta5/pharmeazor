var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap()).get(from),
    desc;
  if (entry) return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if ((from && typeof from === "object") || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name),
    });
};

// src/lib/architecture/frontend/runner.ts
var exports_runner = {};
__export(exports_runner, {
  DEFAULT_FRONTEND_OWNERSHIP_POLICY: () => DEFAULT_FRONTEND_OWNERSHIP_POLICY,
  analyzeFrontendFile: () => analyzeFrontendFile,
  analyzeFrontendProject: () => analyzeFrontendProject,
  classifyFrontendFile: () => classifyFrontendFile,
  validateFrontendOwnershipPolicy: () => validateFrontendOwnershipPolicy,
});
module.exports = __toCommonJS(exports_runner);
var import_node_path14 = require("node:path");
var import_promises11 = require("node:fs/promises");

// src/lib/architecture/collectors/packages.ts
var import_promises3 = require("node:fs/promises");
var import_node_path5 = require("node:path");

// src/lib/architecture/collectors/collector-utils.ts
var import_node_path2 = require("node:path");

// src/lib/architecture/constants.ts
var MAX_VISITED_FILES = 50000;
var MAX_VISITED_ENTRIES = 1e5;
var MAX_WALK_DEPTH = 64;
var SOURCE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);
var SOURCE_COLLECTION_EXCLUDED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".output",
  "out",
  "coverage",
  ".expo",
  ".vite",
]);

// src/lib/architecture/utils.ts
var import_node_path = require("node:path");
function normalizePath(p) {
  return p.split(import_node_path.sep).join("/");
}
function packageForFile(absFile, packages) {
  return packages
    .filter((pkg) => absFile === pkg.dir || absFile.startsWith(pkg.dir + import_node_path.sep))
    .toSorted((left, right) => right.dir.length - left.dir.length)[0];
}

// src/lib/architecture/collectors/collector-utils.ts
function isSourceFile(path) {
  return SOURCE_FILE_EXTENSIONS.has(import_node_path2.extname(path).toLowerCase());
}
function isExcludedDirectory(name) {
  return SOURCE_COLLECTION_EXCLUDED_DIRECTORIES.has(name.toLowerCase());
}
function displayPath(path, root) {
  return normalizePath(import_node_path2.relative(root, path));
}
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function comparePaths(a, b) {
  return compareText(normalizePath(a), normalizePath(b));
}
function pathKey(path) {
  const normalized = normalizePath(import_node_path2.resolve(path));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function samePath(a, b) {
  return pathKey(a) === pathKey(b);
}
function isContained(path, root) {
  const candidate = pathKey(path);
  const boundary = pathKey(root);
  return candidate === boundary || candidate.startsWith(`${boundary}/`);
}
function isMissing(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
function errorCode(error) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code ?? "UNKNOWN");
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

// src/lib/architecture/collectors/package-manifest.ts
var import_promises2 = require("node:fs/promises");
var import_node_path3 = require("node:path");

// src/lib/architecture/collectors/package-policy.ts
var import_promises = require("node:fs/promises");
function createDiscoveryState(options) {
  return {
    entries: 0,
    maxEntries: options.maxEntries ?? MAX_VISITED_ENTRIES,
    maxDepth: options.maxDepth ?? MAX_WALK_DEPTH,
    stopped: false,
    globStates: new Set(),
  };
}
function validateDiscoveryOptions(state, findings) {
  for (const [name, value] of [
    ["maxEntries", state.maxEntries],
    ["maxDepth", state.maxDepth],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      stopPackageDiscovery(
        state,
        findings,
        "package-discovery-invalid-budget",
        `${name} must be a non-negative safe integer`,
        "",
      );
      return false;
    }
  }
  return true;
}
function consumePackageEntry(state, findings, dir, realRoot) {
  if (state.stopped) return false;
  if (state.entries >= state.maxEntries) {
    stopPackageDiscovery(
      state,
      findings,
      "package-discovery-entry-limit",
      `Package discovery entry limit (${state.maxEntries}) exhausted`,
      displayPath(dir, realRoot),
    );
    return false;
  }
  state.entries += 1;
  return true;
}
function stopPackageIo(state, findings, path, realRoot, error) {
  stopPackageDiscovery(
    state,
    findings,
    "package-discovery-io-failure",
    `Unable to cover package path ${displayPath(path, realRoot)}: ${errorCode(error)}`,
    displayPath(path, realRoot),
  );
}
function stopPackageDiscovery(state, findings, id, message, file) {
  if (state.stopped) return;
  state.stopped = true;
  findings.push({ id, severity: "BLOCKER", message, file, rule: "package-discovery" });
}
async function canonicalOptionalPackageDirectory(dir, realRoot, findings, state) {
  let info;
  try {
    info = await import_promises.stat(dir);
  } catch (error) {
    if (isMissing(error)) return;
    stopPackageIo(state, findings, dir, realRoot, error);
    return;
  }
  if (!info.isDirectory()) return;
  let canonical;
  try {
    canonical = await import_promises.realpath(dir);
  } catch (error) {
    stopPackageIo(state, findings, dir, realRoot, error);
    return;
  }
  if (!isContained(canonical, realRoot)) {
    stopPackageDiscovery(
      state,
      findings,
      "workspace-path-outside-project",
      `Workspace path resolves outside project: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  return canonical;
}
async function readOptionalPackageDirectory(dir, realRoot, findings, state) {
  try {
    return (await import_promises.readdir(dir, { withFileTypes: true })).sort((a, b) =>
      compareText(a.name, b.name),
    );
  } catch (error) {
    if (isMissing(error)) return;
    stopPackageIo(state, findings, dir, realRoot, error);
    return;
  }
}

// src/lib/architecture/collectors/package-manifest.ts
async function readPackageManifest(dir, realRoot, findings, state, rootManifest) {
  const manifestPath = import_node_path3.join(dir, "package.json");
  let canonicalManifest;
  try {
    canonicalManifest = await import_promises2.realpath(manifestPath);
  } catch (error) {
    if (isMissing(error)) return;
    stopPackageIo(state, findings, manifestPath, realRoot, error);
    return;
  }
  if (!isContained(canonicalManifest, realRoot)) {
    stopPackageDiscovery(
      state,
      findings,
      "package-manifest-outside-project",
      "Package manifest resolves outside the project",
      displayPath(manifestPath, realRoot),
    );
    return;
  }
  let source;
  try {
    source = await import_promises2.readFile(canonicalManifest, "utf-8");
  } catch (error) {
    stopPackageIo(state, findings, manifestPath, realRoot, error);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    stopPackageDiscovery(
      state,
      findings,
      "package-manifest-coverage-failure",
      `Unable to parse ${rootManifest ? "root " : ""}package manifest: ${errorCode(error)}`,
      displayPath(manifestPath, realRoot),
    );
    return;
  }
  if (!isPackageManifest(parsed)) {
    stopPackageDiscovery(
      state,
      findings,
      "package-manifest-coverage-failure",
      `Invalid ${rootManifest ? "root " : ""}package manifest shape`,
      displayPath(manifestPath, realRoot),
    );
    return;
  }
  let canonicalDir;
  try {
    canonicalDir = await import_promises2.realpath(dir);
  } catch (error) {
    stopPackageIo(state, findings, dir, realRoot, error);
    return;
  }
  return { dir: canonicalDir, canonicalManifestPath: canonicalManifest, manifest: parsed };
}
function toPackageInfo(dir, manifest) {
  const dependencies = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ].sort(compareText);
  return {
    name: manifest.name ?? import_node_path3.basename(dir),
    dir,
    dependencies: new Set(dependencies),
  };
}
function workspacesFrom(manifest) {
  if (!manifest?.workspaces) return [];
  return Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : (manifest.workspaces.packages ?? []);
}
function isPackageManifest(value) {
  if (!isRecord(value)) return false;
  if (value.name !== undefined && typeof value.name !== "string") return false;
  if (!validWorkspaces(value.workspaces)) return false;
  return [
    value.dependencies,
    value.devDependencies,
    value.peerDependencies,
    value.optionalDependencies,
  ].every(validDependencyMap);
}
function validWorkspaces(value) {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.every((entry) => typeof entry === "string");
  return (
    isRecord(value) &&
    (value.packages === undefined ||
      (Array.isArray(value.packages) && value.packages.every((entry) => typeof entry === "string")))
  );
}
function validDependencyMap(value) {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => typeof entry === "string"))
  );
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/lib/architecture/collectors/workspace-globs.ts
var import_node_path4 = require("node:path");
async function expandWorkspacePattern(
  root,
  realRoot,
  rawPattern,
  requiresManifest,
  candidates,
  findings,
  state,
) {
  const pattern = normalizeWorkspacePattern(rawPattern);
  if (!pattern) return;
  if (
    pattern.startsWith("/") ||
    /^[a-zA-Z]:\//.test(pattern) ||
    pattern.split("/").includes("..")
  ) {
    stopPackageDiscovery(
      state,
      findings,
      "workspace-pattern-outside-project",
      `Workspace pattern must stay inside the project: ${rawPattern}`,
      "package.json",
    );
    return;
  }
  await expandSegments(
    root,
    realRoot,
    pattern.split("/"),
    pattern,
    requiresManifest,
    0,
    0,
    candidates,
    findings,
    state,
  );
}
async function expandSegments(
  requestedDir,
  realRoot,
  segments,
  pattern,
  requiresManifest,
  index,
  depth,
  candidates,
  findings,
  state,
) {
  if (state.stopped) return;
  if (depth > state.maxDepth) {
    stopPackageDiscovery(
      state,
      findings,
      "package-discovery-depth-limit",
      `Workspace discovery depth limit (${state.maxDepth}) exhausted`,
      displayPath(requestedDir, realRoot),
    );
    return;
  }
  const current = await canonicalOptionalPackageDirectory(requestedDir, realRoot, findings, state);
  if (!current) return;
  const visitKey = `${pattern}|${index}|${pathKey(current)}`;
  if (state.globStates.has(visitKey)) return;
  state.globStates.add(visitKey);
  if (index === segments.length) {
    const key = pathKey(current);
    const existing = candidates.get(key);
    candidates.set(key, {
      dir: current,
      requiresManifest: requiresManifest || existing?.requiresManifest === true,
    });
    return;
  }
  const segment = segments[index] ?? "";
  if (segment === "**") {
    await expandSegments(
      current,
      realRoot,
      segments,
      pattern,
      requiresManifest,
      index + 1,
      depth,
      candidates,
      findings,
      state,
    );
    const entries = await readOptionalPackageDirectory(current, realRoot, findings, state);
    if (!entries) return;
    for (const entry of entries) {
      if (!consumePackageEntry(state, findings, current, realRoot)) return;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (isExcludedDirectory(entry.name)) continue;
      await expandSegments(
        import_node_path4.join(current, entry.name),
        realRoot,
        segments,
        pattern,
        requiresManifest,
        index,
        depth + 1,
        candidates,
        findings,
        state,
      );
      if (state.stopped) return;
    }
    return;
  }
  if (!hasGlob(segment)) {
    await expandSegments(
      import_node_path4.join(current, segment),
      realRoot,
      segments,
      pattern,
      requiresManifest,
      index + 1,
      depth + 1,
      candidates,
      findings,
      state,
    );
    return;
  }
  const entries = await readOptionalPackageDirectory(current, realRoot, findings, state);
  if (!entries) return;
  const matcher = globSegmentMatcher(segment);
  for (const entry of entries) {
    if (!consumePackageEntry(state, findings, current, realRoot)) return;
    if (!matcher.test(entry.name) || (!entry.isDirectory() && !entry.isSymbolicLink())) continue;
    if (isExcludedDirectory(entry.name)) continue;
    await expandSegments(
      import_node_path4.join(current, entry.name),
      realRoot,
      segments,
      pattern,
      requiresManifest,
      index + 1,
      depth + 1,
      candidates,
      findings,
      state,
    );
    if (state.stopped) return;
  }
}
function normalizeWorkspacePattern(pattern) {
  return pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}
function hasGlob(segment) {
  return segment.includes("*") || segment.includes("?");
}
function globSegmentMatcher(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

// src/lib/architecture/collectors/packages.ts
var DEFAULT_WORKSPACE_PATTERNS = ["apps/*", "packages/*", "tooling/*"];
async function discoverPackages(root, findings = [], options = {}) {
  const state = createDiscoveryState(options);
  if (!validateDiscoveryOptions(state, findings)) return [];
  const absoluteRoot = import_node_path5.resolve(root);
  let realRoot;
  try {
    realRoot = await import_promises3.realpath(absoluteRoot);
  } catch (error) {
    if (isMissing(error)) return [];
    stopPackageDiscovery(
      state,
      findings,
      "package-root-coverage-failure",
      `Unable to resolve package root: ${errorCode(error)}`,
      "",
    );
    return [];
  }
  const rootResult = await readPackageManifest(absoluteRoot, realRoot, findings, state, true);
  if (state.stopped) return [];
  const workspacePatterns = new Map();
  for (const pattern of DEFAULT_WORKSPACE_PATTERNS) workspacePatterns.set(pattern, false);
  for (const pattern of workspacesFrom(rootResult?.manifest)) workspacePatterns.set(pattern, true);
  for (const pattern of options.workspacePatterns ?? []) workspacePatterns.set(pattern, true);
  const candidates = new Map();
  if (rootResult) {
    candidates.set(pathKey(rootResult.dir), {
      dir: rootResult.dir,
      requiresManifest: true,
    });
  }
  for (const [pattern, requiresManifest] of [...workspacePatterns].sort(([a], [b]) =>
    compareText(a, b),
  )) {
    if (state.stopped) break;
    await expandWorkspacePattern(
      absoluteRoot,
      realRoot,
      pattern,
      requiresManifest,
      candidates,
      findings,
      state,
    );
  }
  const packages = [];
  const manifestPaths = new Set();
  for (const candidate of [...candidates.values()].sort((a, b) => comparePaths(a.dir, b.dir))) {
    if (state.stopped) break;
    if (rootResult && samePath(candidate.dir, rootResult.dir)) {
      addManifestPackage(packages, manifestPaths, rootResult);
      continue;
    }
    const result = await readPackageManifest(candidate.dir, realRoot, findings, state, false);
    if (state.stopped) break;
    if (result) {
      addManifestPackage(packages, manifestPaths, result);
    } else if (candidate.requiresManifest) {
      stopPackageDiscovery(
        state,
        findings,
        "package-manifest-coverage-failure",
        "Declared workspace has no readable package.json",
        displayPath(import_node_path5.join(candidate.dir, "package.json"), realRoot),
      );
    } else {
      packages.push({
        name: import_node_path5.basename(candidate.dir),
        dir: candidate.dir,
        dependencies: new Set(),
      });
    }
  }
  const names = new Set();
  for (const pkg of packages) {
    if (names.has(pkg.name)) {
      stopPackageDiscovery(
        state,
        findings,
        "duplicate-package-name",
        `Duplicate package name: ${pkg.name}`,
        displayPath(import_node_path5.join(pkg.dir, "package.json"), realRoot),
      );
      break;
    }
    names.add(pkg.name);
  }
  return packages.sort((a, b) => comparePaths(a.dir, b.dir) || compareText(a.name, b.name));
}
function addManifestPackage(packages, manifestPaths, result) {
  const manifestKey = pathKey(result.canonicalManifestPath);
  if (manifestPaths.has(manifestKey)) return;
  manifestPaths.add(manifestKey);
  packages.push(toPackageInfo(result.dir, result.manifest));
}
// src/lib/architecture/collectors/files.ts
var import_promises7 = require("node:fs/promises");
var import_node_path8 = require("node:path");

// src/lib/architecture/collectors/source-policy.ts
var import_promises5 = require("node:fs/promises");

// src/lib/architecture/graph/symlink.ts
var import_promises4 = require("node:fs/promises");
var import_node_path6 = require("node:path");
var import_node_fs = require("node:fs");
async function safeRealpath(path) {
  try {
    return await import_promises4.realpath(path);
  } catch {
    return;
  }
}
async function isDirectory(absPath) {
  try {
    return (await import_promises4.stat(absPath)).isDirectory();
  } catch {
    return false;
  }
}
function pathIncludesSymlink(p) {
  let curr = import_node_path6.dirname(p);
  const root = parsePathRoot(p);
  let depth = 0;
  const maxDepth = 64;
  while (
    curr !== root &&
    curr !== "." &&
    curr !== import_node_path6.dirname(curr) &&
    depth < maxDepth
  ) {
    try {
      if (import_node_fs.lstatSync(curr).isSymbolicLink()) return true;
    } catch {}
    curr = import_node_path6.dirname(curr);
    depth++;
  }
  return false;
}
function parsePathRoot(p) {
  const match = /^[a-zA-Z]:[\\/]/.exec(p);
  if (match) return match[0];
  if (p.startsWith("/")) return "/";
  if (p.startsWith("\\\\")) {
    const parts = p.split(/[\\/]/).filter(Boolean);
    if (parts.length >= 2) return `\\\\${parts[0]}\\${parts[1]}\\`;
  }
  return "";
}

// src/lib/architecture/collectors/source-policy.ts
function resolveSourceOptions(options) {
  return {
    sourceRoots: options.sourceRoots ?? [],
    includeDefaultRoots: options.includeDefaultRoots ?? true,
    maxSourceFiles: options.maxSourceFiles ?? MAX_VISITED_FILES,
    maxEntries: options.maxEntries ?? MAX_VISITED_ENTRIES,
    maxDepth: options.maxDepth ?? MAX_WALK_DEPTH,
  };
}
function createSourceState(options) {
  return {
    options: resolveSourceOptions(options),
    entries: 0,
    stopped: false,
    canonicalDirs: new Set(),
    shallowDirs: new Set(),
  };
}
function validateSourceOptions(state, findings) {
  for (const [name, value] of [
    ["maxSourceFiles", state.options.maxSourceFiles],
    ["maxEntries", state.options.maxEntries],
    ["maxDepth", state.options.maxDepth],
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      stopSourceCollection(
        state,
        findings,
        "source-collection-invalid-budget",
        `${name} must be a non-negative safe integer`,
        "",
      );
      return false;
    }
  }
  return true;
}
function consumeSourceEntry(state, findings, dir, realRoot) {
  if (state.stopped) return false;
  if (state.entries >= state.options.maxEntries) {
    stopSourceCollection(
      state,
      findings,
      "source-entry-limit",
      `Directory entry limit (${state.options.maxEntries}) exhausted`,
      displayPath(dir, realRoot),
    );
    return false;
  }
  state.entries += 1;
  return true;
}
function stopSourceIo(state, findings, path, realRoot, error) {
  stopSourceCollection(
    state,
    findings,
    "source-collection-io-failure",
    `Unable to cover source path ${displayPath(path, realRoot)}: ${errorCode(error)}`,
    displayPath(path, realRoot),
  );
}
function stopSourceCollection(state, findings, id, message, file) {
  if (state.stopped) return;
  state.stopped = true;
  findings.push({ id, severity: "BLOCKER", message, file, rule: "source-collection" });
}
async function canonicalOptionalSourceDirectory(dir, realRoot, findings, state) {
  let info;
  try {
    info = await import_promises5.stat(dir);
  } catch (error) {
    if (isMissing(error)) return;
    stopSourceIo(state, findings, dir, realRoot, error);
    return;
  }
  if (!info.isDirectory()) return;
  const canonical = await safeRealpath(dir);
  if (!canonical) {
    stopSourceCollection(
      state,
      findings,
      "source-root-coverage-failure",
      `Unable to canonicalize source directory: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  if (!isContained(canonical, realRoot)) {
    stopSourceCollection(
      state,
      findings,
      "source-root-outside-project",
      `Source directory resolves outside project: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  return canonical;
}
async function readRequiredSourceDirectory(dir, realRoot, findings, state) {
  try {
    return (await import_promises5.readdir(dir, { withFileTypes: true })).sort((a, b) =>
      compareText(a.name, b.name),
    );
  } catch (error) {
    stopSourceIo(state, findings, dir, realRoot, error);
    return;
  }
}

// src/lib/architecture/collectors/source-traversal.ts
var import_promises6 = require("node:fs/promises");
var import_node_path7 = require("node:path");
async function walkSource(
  dir,
  realRoot,
  files,
  visited,
  findings,
  depth,
  options = {},
  sharedState,
) {
  const state = sharedState ?? createSourceState(options);
  if (state.stopped) return;
  const canonical = await safeRealpath(dir);
  if (!canonical) {
    stopSourceCollection(
      state,
      findings,
      "source-root-coverage-failure",
      `Unable to canonicalize source directory: ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  if (!isContained(canonical, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Path resolved outside project root: ${displayPath(dir, realRoot)}`,
      file: displayPath(dir, realRoot),
      rule: "source-collection",
    });
    return;
  }
  const canonicalKey = pathKey(canonical);
  if (state.canonicalDirs.has(canonicalKey)) return;
  if (depth > state.options.maxDepth) {
    stopSourceCollection(
      state,
      findings,
      "directory-depth-limit",
      `Directory depth limit (${state.options.maxDepth}) exhausted at ${displayPath(dir, realRoot)}`,
      displayPath(dir, realRoot),
    );
    return;
  }
  state.canonicalDirs.add(canonicalKey);
  const entries = await readRequiredSourceDirectory(canonical, realRoot, findings, state);
  if (!entries) return;
  for (const entry of entries) {
    if (!consumeSourceEntry(state, findings, canonical, realRoot)) return;
    const logicalPath = import_node_path7.join(canonical, entry.name);
    if (
      (entry.isDirectory() || entry.isSymbolicLink()) &&
      shouldExcludeDirectory(logicalPath, entry.name, realRoot)
    ) {
      continue;
    }
    if (entry.isSymbolicLink() || pathIncludesSymlink(logicalPath)) {
      await visitSymlink(
        logicalPath,
        entry.isDirectory(),
        realRoot,
        files,
        visited,
        findings,
        depth,
        state,
      );
    } else if (entry.isDirectory()) {
      await walkSource(
        logicalPath,
        realRoot,
        files,
        visited,
        findings,
        depth + 1,
        state.options,
        state,
      );
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      await tryAddSourceFile(logicalPath, realRoot, files, visited, findings, state);
    }
    if (state.stopped) return;
  }
}
async function visitSymlink(
  logicalPath,
  dirEntryIsDirectory,
  realRoot,
  files,
  visited,
  findings,
  depth,
  state,
) {
  const realPath = await safeRealpath(logicalPath);
  if (!realPath) {
    findings.push({
      id: "unresolvable-symlink",
      severity: "MEDIUM",
      message: `Unable to resolve symlink: ${displayPath(logicalPath, realRoot)}`,
      file: displayPath(logicalPath, realRoot),
      rule: "source-collection",
    });
    return;
  }
  if (!isContained(realPath, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Path resolved outside project root: ${displayPath(logicalPath, realRoot)}`,
      file: displayPath(logicalPath, realRoot),
      rule: "source-collection",
    });
    return;
  }
  if (dirEntryIsDirectory || (await isDirectory(realPath))) {
    await walkSource(realPath, realRoot, files, visited, findings, depth + 1, state.options, state);
  } else if (isSourceFile(logicalPath)) {
    await tryAddSourceFile(realPath, realRoot, files, visited, findings, state, logicalPath);
  }
}
async function tryAddSourceFile(
  absPath,
  realRoot,
  files,
  visited,
  findings,
  sharedState,
  logicalPath = absPath,
) {
  const state = sharedState ?? createSourceState({});
  if (state.stopped || !isSourceFile(logicalPath)) return;
  let realAbsPath;
  try {
    realAbsPath = await import_promises6.realpath(absPath);
  } catch (error) {
    stopSourceIo(state, findings, absPath, realRoot, error);
    return;
  }
  if (!isContained(realAbsPath, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Source file resolved outside project root: ${displayPath(absPath, realRoot)}`,
      file: displayPath(absPath, realRoot),
      rule: "source-collection",
    });
    return;
  }
  let info;
  try {
    info = await import_promises6.stat(realAbsPath);
  } catch (error) {
    stopSourceIo(state, findings, absPath, realRoot, error);
    return;
  }
  if (!info.isFile()) {
    stopSourceCollection(
      state,
      findings,
      "source-file-coverage-failure",
      `Source path is not a regular file: ${displayPath(logicalPath, realRoot)}`,
      displayPath(logicalPath, realRoot),
    );
    return;
  }
  const key = pathKey(realAbsPath);
  if (visited.has(key)) return;
  if (files.length >= state.options.maxSourceFiles) {
    stopSourceCollection(
      state,
      findings,
      "source-collection-limit",
      `Source file limit (${state.options.maxSourceFiles}) exhausted`,
      displayPath(logicalPath, realRoot),
    );
    return;
  }
  visited.add(key);
  files.push(import_node_path7.resolve(logicalPath));
}
function shouldExcludeDirectory(path, name, realRoot) {
  if (isExcludedDirectory(name)) return true;
  const rel = displayPath(path, realRoot);
  return rel === "convex/_generated" || rel.includes("/convex/_generated/");
}

// src/lib/architecture/collectors/files.ts
var ROOT_SOURCE_DIRS = ["src", "app", "tests", "convex", "agent"];
var APP_SOURCE_DIRS = ["src", "app", "tests", "e2e", "agent", "evals"];
var PACKAGE_SOURCE_DIRS = ["src", "tests"];
var DEFAULT_PACKAGE_CONTAINERS = ["apps", "packages", "tooling"];
async function collectSourceFiles(root, packages, findings, options = {}) {
  const files = [];
  const visited = new Set();
  const state = createSourceState(options);
  if (!validateSourceOptions(state, findings)) return files;
  const absoluteRoot = import_node_path8.resolve(root);
  let realRoot;
  try {
    realRoot = await import_promises7.realpath(absoluteRoot);
  } catch (error) {
    if (isMissing(error)) return files;
    stopSourceCollection(
      state,
      findings,
      "source-root-coverage-failure",
      `Unable to resolve project root: ${errorCode(error)}`,
      "",
    );
    return files;
  }
  const packageDirs = new Set([absoluteRoot]);
  for (const pkg of packages) packageDirs.add(import_node_path8.resolve(pkg.dir));
  const candidates = [];
  if (state.options.includeDefaultRoots) {
    addRoots(candidates, absoluteRoot, ROOT_SOURCE_DIRS);
    await addDefaultContainerRoots(
      absoluteRoot,
      realRoot,
      packageDirs,
      candidates,
      findings,
      state,
    );
    for (const pkgDir of packageDirs) {
      if (!samePath(pkgDir, absoluteRoot)) {
        addRoots(candidates, pkgDir, sourceDirsForPackage(absoluteRoot, pkgDir));
      }
    }
  }
  for (const configuredRoot of state.options.sourceRoots) {
    candidates.push({
      dir: import_node_path8.resolve(absoluteRoot, configuredRoot),
      required: true,
    });
  }
  for (const pkgDir of [...packageDirs].sort(comparePaths)) {
    if (state.stopped) break;
    await scanPackageRoot(pkgDir, realRoot, files, visited, findings, state);
  }
  for (const candidate of dedupeCandidates(candidates)) {
    if (state.stopped) break;
    await scanCandidate(candidate, realRoot, files, visited, findings, state);
  }
  if (state.options.includeDefaultRoots && !state.stopped) {
    const protocol = import_node_path8.join(realRoot, "convex", "_generated", "api.js");
    try {
      await import_promises7.lstat(protocol);
      if (consumeSourceEntry(state, findings, protocol, realRoot)) {
        await tryAddSourceFile(protocol, realRoot, files, visited, findings, state);
      }
    } catch (error) {
      if (!isMissing(error))
        stopSourceCollection(
          state,
          findings,
          "source-file-coverage-failure",
          `Unable to inspect Convex client protocol: ${errorCode(error)}`,
          "convex/_generated/api.js",
        );
    }
  }
  return files.sort(comparePaths);
}
async function addDefaultContainerRoots(root, realRoot, packageDirs, candidates, findings, state) {
  for (const containerName of DEFAULT_PACKAGE_CONTAINERS) {
    if (state.stopped) return;
    const container = await canonicalOptionalSourceDirectory(
      import_node_path8.join(root, containerName),
      realRoot,
      findings,
      state,
    );
    if (!container) continue;
    const entries = await readRequiredSourceDirectory(container, realRoot, findings, state);
    if (!entries) continue;
    for (const entry of entries) {
      if (!consumeSourceEntry(state, findings, container, realRoot)) return;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (isExcludedDirectory(entry.name)) continue;
      const pkgDir = import_node_path8.join(container, entry.name);
      packageDirs.add(pkgDir);
      addRoots(
        candidates,
        pkgDir,
        containerName === "apps" ? APP_SOURCE_DIRS : PACKAGE_SOURCE_DIRS,
      );
    }
  }
}
async function scanPackageRoot(pkgDir, realRoot, files, visited, findings, state) {
  const canonical = await canonicalOptionalSourceDirectory(pkgDir, realRoot, findings, state);
  if (!canonical) return;
  const key = pathKey(canonical);
  if (state.shallowDirs.has(key)) return;
  state.shallowDirs.add(key);
  const entries = await readRequiredSourceDirectory(canonical, realRoot, findings, state);
  if (!entries) return;
  for (const entry of entries) {
    if (!consumeSourceEntry(state, findings, canonical, realRoot)) return;
    if ((entry.isFile() || entry.isSymbolicLink()) && isSourceFile(entry.name)) {
      const logicalPath = import_node_path8.join(canonical, entry.name);
      await tryAddSourceFile(logicalPath, realRoot, files, visited, findings, state, logicalPath);
      if (state.stopped) return;
    }
  }
}
async function scanCandidate(candidate, realRoot, files, visited, findings, state) {
  const canonical = await canonicalOptionalSourceDirectory(
    candidate.dir,
    realRoot,
    findings,
    state,
  );
  if (!canonical && candidate.required && !state.stopped) {
    stopSourceCollection(
      state,
      findings,
      "configured-source-root-missing",
      `Configured source root does not exist: ${displayPath(candidate.dir, realRoot)}`,
      displayPath(candidate.dir, realRoot),
    );
  }
  if (!canonical) return;
  await walkSource(canonical, realRoot, files, visited, findings, 0, state.options, state);
}
function sourceDirsForPackage(root, pkgDir) {
  const rel = normalizePath(import_node_path8.relative(root, pkgDir));
  return rel === "apps" || rel.startsWith("apps/") ? APP_SOURCE_DIRS : PACKAGE_SOURCE_DIRS;
}
function addRoots(candidates, parent, names) {
  for (const name of names)
    candidates.push({ dir: import_node_path8.join(parent, name), required: false });
}
function dedupeCandidates(candidates) {
  const byPath = new Map();
  for (const candidate of candidates) {
    const key = pathKey(candidate.dir);
    const existing = byPath.get(key);
    byPath.set(key, {
      dir: candidate.dir,
      required: candidate.required || existing?.required === true,
    });
  }
  return [...byPath.values()].sort((a, b) => comparePaths(a.dir, b.dir));
}
// src/lib/architecture/resolution/resolver.ts
var import_node_module = require("node:module");
var import_node_path13 = require("node:path");

// src/lib/architecture/resolution/package-resolver.ts
var import_node_path11 = require("node:path");

// src/lib/architecture/resolution/packages.ts
var import_promises9 = require("node:fs/promises");
var import_node_path10 = require("node:path");

// src/lib/architecture/resolution/paths.ts
var import_promises8 = require("node:fs/promises");
var import_node_path9 = require("node:path");

// src/lib/architecture/resolution/json.ts
function parseJsonc(source) {
  try {
    return JSON.parse(removeTrailingCommas(stripComments(source)));
  } catch {
    return;
  }
}
function stripComments(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (lineComment) {
      if (
        current ===
          `
` ||
        current === "\r"
      ) {
        lineComment = false;
        result += current;
      } else {
        result += " ";
      }
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        result += "  ";
        index += 1;
      } else {
        result +=
          current ===
            `
` || current === "\r"
            ? current
            : " ";
      }
      continue;
    }
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
    } else if (current === "/" && next === "/") {
      lineComment = true;
      result += "  ";
      index += 1;
    } else if (current === "/" && next === "*") {
      blockComment = true;
      result += "  ";
      index += 1;
    } else {
      result += current;
    }
  }
  return result;
}
function removeTrailingCommas(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] ?? "";
    if (inString) {
      result += current;
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') inString = false;
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }
    if (current === ",") {
      let lookahead = index + 1;
      while (/\s/.test(source[lookahead] ?? "")) lookahead += 1;
      if (source[lookahead] === "}" || source[lookahead] === "]") continue;
    }
    result += current;
  }
  return result;
}

// src/lib/architecture/resolution/paths.ts
var TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
var JAVASCRIPT_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];
var SOURCE_EXTENSIONS = [...TYPESCRIPT_EXTENSIONS, ...JAVASCRIPT_EXTENSIONS];
var DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];
var EXACT_IMPORT_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".css",
  ".csv",
  ".eot",
  ".gif",
  ".gql",
  ".graphql",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".json",
  ".json5",
  ".less",
  ".md",
  ".mdx",
  ".node",
  ".otf",
  ".png",
  ".sass",
  ".scss",
  ".sql",
  ".svg",
  ".toml",
  ".ttf",
  ".txt",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
  ".yaml",
  ".yml",
]);
var JS_TO_TS_EXTENSIONS = {
  ".js": [".ts", ".tsx", ".mts", ".cts"],
  ".jsx": [".tsx", ".ts"],
  ".mjs": [".mts", ".ts"],
  ".cjs": [".cts", ".ts"],
};

class ProjectPathResolver {
  root;
  entryCache = new Map();
  jsonCache = new Map();
  constructor(root) {
    this.root = import_node_path9.resolve(root);
  }
  toAbsolute(path) {
    return import_node_path9.isAbsolute(path)
      ? import_node_path9.resolve(path)
      : import_node_path9.resolve(this.root, path);
  }
  isInside(path) {
    const rel = import_node_path9.relative(this.root, import_node_path9.resolve(path));
    return (
      rel === "" ||
      (!rel.startsWith(`..${import_node_path9.sep}`) &&
        rel !== ".." &&
        !import_node_path9.isAbsolute(rel))
    );
  }
  toProjectPath(path) {
    if (!this.isInside(path)) return;
    const rel = import_node_path9.relative(this.root, import_node_path9.resolve(path));
    return normalizePath2(rel || ".");
  }
  async readJson(path) {
    const absolute = import_node_path9.resolve(path);
    if (this.jsonCache.has(absolute)) return this.jsonCache.get(absolute);
    try {
      const parsed = parseJsonc(await import_promises8.readFile(absolute, "utf8"));
      this.jsonCache.set(absolute, parsed);
      return parsed;
    } catch {
      this.jsonCache.set(absolute, undefined);
      return;
    }
  }
  async resolveModule(requestedPath, allowDeclarationFiles = false) {
    const requested = import_node_path9.resolve(requestedPath);
    if (!this.isInside(requested)) return { status: "outside" };
    const extension = import_node_path9.extname(requested).toLowerCase();
    if (EXACT_IMPORT_EXTENSIONS.has(extension)) {
      return this.resolveExact(requested);
    }
    const fileCandidates = moduleFileCandidates(requested, extension, allowDeclarationFiles);
    for (const candidate of fileCandidates) {
      const kind = await this.entryKind(candidate);
      if (kind === "outside") return { status: "outside" };
      if (kind === "file") return { status: "resolved", absolute: candidate };
    }
    if ((await this.entryKind(requested)) === "directory") {
      const manifest = await this.readJson(import_node_path9.join(requested, "package.json"));
      for (const entry of [manifest?.types, manifest?.typings, manifest?.module, manifest?.main]) {
        if (!entry) continue;
        const nested = await this.resolveModule(
          import_node_path9.resolve(requested, entry),
          allowDeclarationFiles,
        );
        if (nested.status !== "missing") return nested;
      }
      const indexExtensions = [
        ...TYPESCRIPT_EXTENSIONS,
        ...(allowDeclarationFiles ? DECLARATION_EXTENSIONS : []),
        ...JAVASCRIPT_EXTENSIONS,
        ".json",
      ];
      for (const sourceExtension of indexExtensions) {
        const indexCandidate = import_node_path9.join(requested, `index${sourceExtension}`);
        const kind = await this.entryKind(indexCandidate);
        if (kind === "outside") return { status: "outside" };
        if (kind === "file") return { status: "resolved", absolute: indexCandidate };
      }
    }
    return { status: "missing" };
  }
  async resolveExact(requestedPath) {
    const requested = import_node_path9.resolve(requestedPath);
    if (!this.isInside(requested)) return { status: "outside" };
    const kind = await this.entryKind(requested);
    if (kind === "outside") return { status: "outside" };
    return kind === "file" ? { status: "resolved", absolute: requested } : { status: "missing" };
  }
  async entryKind(path) {
    const absolute = import_node_path9.resolve(path);
    const cached = this.entryCache.get(absolute);
    if (cached) return cached;
    if (!this.isInside(absolute)) return "outside";
    try {
      const entry = await import_promises8.stat(absolute);
      const canonical = await import_promises8.realpath(absolute);
      if (!this.isInside(canonical)) {
        this.entryCache.set(absolute, "outside");
        return "outside";
      }
      const kind = entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "missing";
      this.entryCache.set(absolute, kind);
      return kind;
    } catch {
      this.entryCache.set(absolute, "missing");
      return "missing";
    }
  }
}
function normalizePath2(path) {
  return path.replaceAll("\\", "/");
}
function stripQueryAndHash(specifier) {
  if (specifier.startsWith("#")) {
    const query = specifier.indexOf("?");
    return query === -1 ? specifier : specifier.slice(0, query);
  }
  const query = specifier.indexOf("?");
  const hash = specifier.indexOf("#");
  const end = Math.min(
    query === -1 ? specifier.length : query,
    hash === -1 ? specifier.length : hash,
  );
  return specifier.slice(0, end);
}
function intendedProjectPath(paths, requestedPath) {
  return paths.toProjectPath(import_node_path9.resolve(requestedPath));
}
function moduleFileCandidates(requested, extension, allowDeclarationFiles) {
  if (isDeclarationFile(requested)) return allowDeclarationFiles ? [requested] : [];
  if (extension) {
    const stem = requested.slice(0, -extension.length);
    const sourceSubstitutions = JS_TO_TS_EXTENSIONS[extension];
    if (sourceSubstitutions) {
      return [
        ...sourceSubstitutions.map((ext) => stem + ext),
        ...(allowDeclarationFiles ? declarationSubstitutions(stem, extension) : []),
        requested,
      ];
    }
    return SOURCE_EXTENSIONS.includes(extension)
      ? [requested]
      : [requested, ...SOURCE_EXTENSIONS.map((ext) => requested + ext)];
  }
  return [
    requested,
    ...TYPESCRIPT_EXTENSIONS.map((ext) => requested + ext),
    ...(allowDeclarationFiles ? DECLARATION_EXTENSIONS.map((ext) => requested + ext) : []),
    ...JAVASCRIPT_EXTENSIONS.map((ext) => requested + ext),
    requested + ".json",
  ];
}
function isDeclarationFile(path) {
  const lower = path.toLowerCase();
  return DECLARATION_EXTENSIONS.some((extension) => lower.endsWith(extension));
}
function declarationSubstitutions(stem, extension) {
  if (extension === ".mjs") return [stem + ".d.mts", stem + ".d.ts"];
  if (extension === ".cjs") return [stem + ".d.cts", stem + ".d.ts"];
  return [stem + ".d.ts"];
}

// src/lib/architecture/resolution/packages.ts
var SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".output",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);
async function discoverWorkspacePackages(paths) {
  const rootRaw = await paths.readJson(import_node_path10.join(paths.root, "package.json"));
  const rootManifest = rootRaw ? toManifest(paths, paths.root, rootRaw) : undefined;
  const configured = Array.isArray(rootRaw?.workspaces)
    ? rootRaw.workspaces
    : (rootRaw?.workspaces?.packages ?? []);
  const patterns = configured.length > 0 ? configured : ["apps/*", "packages/*", "tooling/*"];
  const candidates = new Set();
  for (const scanRoot of scanRoots(paths.root, patterns)) {
    await collectManifestDirectories(scanRoot, paths.root, candidates);
  }
  const manifests = [];
  for (const dir of [...candidates].sort(compareText2)) {
    const relativeDir = normalizePath2(import_node_path10.relative(paths.root, dir));
    if (!matchesWorkspace(relativeDir, patterns)) continue;
    const raw = await paths.readJson(import_node_path10.join(dir, "package.json"));
    if (raw) manifests.push(toManifest(paths, dir, raw));
  }
  const packagesByName = new Map();
  for (const manifest of manifests) {
    if (!manifest.name) continue;
    const current = packagesByName.get(manifest.name) ?? [];
    current.push(manifest);
    current.sort((left, right) => compareText2(left.relativeDir, right.relativeDir));
    packagesByName.set(manifest.name, current);
  }
  return { rootManifest, packagesByName };
}
async function findNearestPackageManifest(paths, fromFile) {
  let current = import_node_path10.dirname(import_node_path10.resolve(fromFile));
  while (paths.isInside(current)) {
    const raw = await paths.readJson(import_node_path10.join(current, "package.json"));
    if (raw) return toManifest(paths, current, raw);
    if (current === paths.root) break;
    const parent = import_node_path10.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return;
}
function packageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("#")) return;
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    return parts.length >= 2 && parts[0] && parts[1] ? `${parts[0]}/${parts[1]}` : undefined;
  }
  return parts[0] || undefined;
}
function packageSubpath(specifier, packageName) {
  const remainder = specifier.slice(packageName.length);
  return remainder ? `.${remainder.startsWith("/") ? remainder : `/${remainder}`}` : ".";
}
function selectExportsTarget(exportsField, subpath, conditions) {
  if (exportsField === undefined) return { status: "unmatched" };
  if (!isTargetMap(exportsField)) {
    return subpath === "."
      ? selectConditionalTarget(exportsField, conditions)
      : { status: "unmatched" };
  }
  const keys = Object.keys(exportsField);
  const isSubpathMap = keys.some((key) => key.startsWith("."));
  if (!isSubpathMap) {
    return subpath === "."
      ? selectConditionalTarget(exportsField, conditions)
      : { status: "unmatched" };
  }
  return selectMappedTarget(exportsField, subpath, conditions);
}
function selectImportsTarget(importsField, specifier, conditions) {
  return importsField
    ? selectMappedTarget(importsField, specifier, conditions)
    : { status: "unmatched" };
}
function selectMappedTarget(mappings, key, conditions) {
  if (Object.hasOwn(mappings, key)) {
    return selectConditionalTarget(mappings[key] ?? null, conditions);
  }
  const patterns = Object.keys(mappings)
    .filter((pattern) => pattern.includes("*") && patternMatches(pattern, key))
    .sort((left, right) => {
      const leftPrefix = left.indexOf("*");
      const rightPrefix = right.indexOf("*");
      return rightPrefix - leftPrefix || right.length - left.length || compareText2(left, right);
    });
  const pattern = patterns[0];
  if (!pattern) return { status: "unmatched" };
  const capture = capturePattern(pattern, key);
  const selected = selectConditionalTarget(mappings[pattern] ?? null, conditions);
  return selected.target === undefined
    ? selected
    : { status: "matched", target: selected.target.replaceAll("*", capture) };
}
function selectConditionalTarget(target, conditions) {
  if (target === null) return { status: "blocked" };
  if (typeof target === "string") return { status: "matched", target };
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const selected = selectConditionalTarget(candidate, conditions);
      if (selected.status === "matched") return selected;
    }
    return { status: "blocked" };
  }
  for (const [condition, candidate] of Object.entries(target)) {
    if (condition !== "default" && !conditions.has(condition)) continue;
    return selectConditionalTarget(candidate, conditions);
  }
  return { status: "blocked" };
}
function patternMatches(pattern, value) {
  const star = pattern.indexOf("*");
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (
    value.startsWith(prefix) &&
    value.endsWith(suffix) &&
    value.length >= prefix.length + suffix.length
  );
}
function capturePattern(pattern, value) {
  const star = pattern.indexOf("*");
  const suffixLength = pattern.length - star - 1;
  return value.slice(star, suffixLength === 0 ? undefined : -suffixLength);
}
function isTargetMap(target) {
  return typeof target === "object" && target !== null && !Array.isArray(target);
}
function toManifest(paths, dir, raw) {
  return {
    dir: import_node_path10.resolve(dir),
    relativeDir: paths.toProjectPath(dir) ?? ".",
    name: raw.name,
    exports: raw.exports,
    imports: raw.imports,
    main: raw.main,
    module: raw.module,
    types: raw.types,
    typings: raw.typings,
    tsconfig: raw.tsconfig,
  };
}
function scanRoots(root, patterns) {
  const roots = new Set();
  for (const rawPattern of patterns) {
    if (rawPattern.startsWith("!")) continue;
    const pattern = normalizePath2(rawPattern).replace(/^\.\//, "");
    const first = pattern.split("/")[0] ?? "";
    roots.add(first && !/[?*]/.test(first) ? import_node_path10.join(root, first) : root);
  }
  return [...roots].sort(compareText2);
}
function compareText2(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
async function collectManifestDirectories(dir, root, result) {
  if (
    !normalizePath2(import_node_path10.relative(root, dir)).startsWith("..") &&
    import_node_path10.basename(dir) === "node_modules"
  )
    return;
  let entries;
  try {
    entries = await import_promises9.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (entries.some((entry) => entry.isFile() && entry.name === "package.json")) result.add(dir);
  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    await collectManifestDirectories(import_node_path10.join(dir, entry.name), root, result);
  }
}
function matchesWorkspace(relativeDir, patterns) {
  const includes = patterns.filter((pattern) => !pattern.startsWith("!"));
  const excludes = patterns
    .filter((pattern) => pattern.startsWith("!"))
    .map((pattern) => pattern.slice(1));
  return (
    includes.some((pattern) => globMatches(pattern, relativeDir)) &&
    !excludes.some((pattern) => globMatches(pattern, relativeDir))
  );
}
function globMatches(pattern, value) {
  const normalized = normalizePath2(pattern).replace(/^\.\//, "").replace(/\/$/, "");
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? "";
    if (char === "*" && normalized[index + 1] === "*") {
      source += normalized[index + 2] === "/" ? "(?:.*/)?" : ".*";
      index += normalized[index + 2] === "/" ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${source}$`).test(normalizePath2(value));
}

// src/lib/architecture/resolution/result.ts
function resolutionResult(reference, specifier, source, kind, owned, reason, target, packageName) {
  return { reference, specifier, source, kind, owned, target, packageName, reason };
}

// src/lib/architecture/resolution/package-resolver.ts
class OwnedPackageResolver {
  paths;
  workspaces;
  extraConditions;
  packageCache = new Map();
  ownedScopes = new Set(["@repo"]);
  constructor(paths, workspaces, extraConditions) {
    this.paths = paths;
    this.workspaces = workspaces;
    this.extraConditions = extraConditions;
    for (const packageName of workspaces.packagesByName.keys()) {
      const scope = workspaceScope(packageName);
      if (scope) this.ownedScopes.add(scope);
    }
    const rootScope = workspaceScope(workspaces.rootManifest?.name);
    if (rootScope) this.ownedScopes.add(rootScope);
  }
  async resolvePackageImport(sourceAbsolute, source, specifier, reference, seen = new Set()) {
    if (seen.has(specifier)) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "package-import-target-missing",
      );
    }
    seen.add(specifier);
    const owner = await this.nearestPackage(sourceAbsolute);
    const selected = selectImportsTarget(owner?.imports, specifier, this.conditions(reference));
    if (selected.status === "unmatched") {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "package-import-not-defined",
      );
    }
    if (selected.status === "blocked" || !selected.target) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "package-import-blocked",
      );
    }
    if (selected.target.startsWith("#")) {
      return this.resolvePackageImport(sourceAbsolute, source, selected.target, reference, seen);
    }
    if (!selected.target.startsWith("./") || !owner) {
      return this.resolvePackageSpecifier(sourceAbsolute, source, selected.target, reference);
    }
    const requested = import_node_path11.resolve(owner.dir, selected.target);
    const resolution = await this.paths.resolveModule(requested, reference.typeOnly);
    if (resolution.status === "outside") {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "target-outside-project",
      );
    }
    return resolution.status === "resolved"
      ? resolutionResult(
          reference,
          specifier,
          source,
          "internal",
          true,
          "package-import",
          this.paths.toProjectPath(resolution.absolute),
        )
      : resolutionResult(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "package-import-target-missing",
          intendedProjectPath(this.paths, requested),
        );
  }
  async resolvePackageSpecifier(sourceAbsolute, source, specifier, reference) {
    const packageName = packageNameFromSpecifier(specifier);
    if (!packageName) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        false,
        "invalid-specifier",
      );
    }
    const owner = await this.nearestPackage(sourceAbsolute);
    if (owner?.name === packageName) {
      return this.resolvePackageManifest(owner, source, specifier, packageName, reference, true);
    }
    const workspaceMatches = this.workspaces.packagesByName.get(packageName) ?? [];
    if (workspaceMatches.length > 1) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "workspace-package-ambiguous",
        undefined,
        packageName,
      );
    }
    if (workspaceMatches[0]) {
      return this.resolvePackageManifest(
        workspaceMatches[0],
        source,
        specifier,
        packageName,
        reference,
        false,
      );
    }
    const scope = workspaceScope(packageName);
    if (scope && this.ownedScopes.has(scope)) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "workspace-package-not-found",
        undefined,
        packageName,
      );
    }
    return resolutionResult(
      reference,
      specifier,
      source,
      "external",
      false,
      "external-package",
      undefined,
      packageName,
    );
  }
  async resolvePackageManifest(manifest, source, specifier, packageName, reference, self) {
    const prefix = self ? "self" : "workspace";
    const subpath = packageSubpath(specifier, packageName);
    if (manifest.exports !== undefined) {
      const selected = selectExportsTarget(manifest.exports, subpath, this.conditions(reference));
      if (selected.status !== "matched" || !selected.target) {
        const reason = `${prefix}-export-${selected.status === "blocked" ? "blocked" : "not-defined"}`;
        return resolutionResult(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          reason,
          undefined,
          packageName,
        );
      }
      if (!selected.target.startsWith("./")) {
        return resolutionResult(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "target-outside-project",
          undefined,
          packageName,
        );
      }
      return this.resolveManifestPath(
        import_node_path11.resolve(manifest.dir, selected.target),
        source,
        specifier,
        packageName,
        reference,
        self,
      );
    }
    const candidates =
      subpath === "."
        ? [
            manifest.types,
            manifest.typings,
            manifest.module,
            manifest.main,
            "src/index.ts",
            "index.ts",
          ].filter((value) => Boolean(value))
        : [subpath.slice(2)];
    for (const candidate of candidates) {
      const requested = import_node_path11.resolve(manifest.dir, candidate);
      const resolution = await this.paths.resolveModule(requested, reference.typeOnly);
      if (resolution.status === "outside") {
        return resolutionResult(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "target-outside-project",
          undefined,
          packageName,
        );
      }
      if (resolution.status === "resolved") {
        return resolutionResult(
          reference,
          specifier,
          source,
          "workspace",
          true,
          self ? "self-reference" : "workspace-export",
          this.paths.toProjectPath(resolution.absolute),
          packageName,
        );
      }
    }
    return resolutionResult(
      reference,
      specifier,
      source,
      "unresolved",
      true,
      `${prefix}-target-missing`,
      undefined,
      packageName,
    );
  }
  async resolveManifestPath(requested, source, specifier, packageName, reference, self) {
    const resolution = await this.paths.resolveModule(requested, reference.typeOnly);
    if (resolution.status === "outside") {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "target-outside-project",
        undefined,
        packageName,
      );
    }
    return resolution.status === "resolved"
      ? resolutionResult(
          reference,
          specifier,
          source,
          "workspace",
          true,
          self ? "self-reference" : "workspace-export",
          this.paths.toProjectPath(resolution.absolute),
          packageName,
        )
      : resolutionResult(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          self ? "self-target-missing" : "workspace-target-missing",
          intendedProjectPath(this.paths, requested),
          packageName,
        );
  }
  nearestPackage(sourceAbsolute) {
    const directory = import_node_path11.dirname(sourceAbsolute);
    const cached = this.packageCache.get(directory);
    if (cached) return cached;
    const pending = findNearestPackageManifest(this.paths, sourceAbsolute);
    this.packageCache.set(directory, pending);
    return pending;
  }
  conditions(reference) {
    const conditions = new Set(this.extraConditions);
    if (reference.typeOnly) conditions.add("types");
    conditions.add(
      reference.kind === "require" || reference.kind === "import-equals" ? "require" : "import",
    );
    conditions.add("default");
    return conditions;
  }
}
function workspaceScope(packageName) {
  return packageName?.startsWith("@") ? packageName.split("/")[0] : undefined;
}

// src/lib/architecture/resolution/tsconfig.ts
var import_node_path12 = require("node:path");
class TypeScriptConfigLoader {
  paths;
  workspaces;
  configCache = new Map();
  nearestCache = new Map();
  constructor(paths, workspaces) {
    this.paths = paths;
    this.workspaces = workspaces;
  }
  loadNearest(fromFile) {
    const start = import_node_path12.dirname(import_node_path12.resolve(fromFile));
    const cached = this.nearestCache.get(start);
    if (cached) return cached;
    const pending = this.findAndLoadNearest(start);
    this.nearestCache.set(start, pending);
    return pending;
  }
  async findAndLoadNearest(start) {
    let current = start;
    while (this.paths.isInside(current)) {
      for (const name of ["tsconfig.json", "jsconfig.json"]) {
        const candidate = import_node_path12.join(current, name);
        const raw = await this.paths.readJson(candidate);
        if (raw) return this.loadConfig(candidate, new Set());
      }
      if (current === this.paths.root) break;
      const parent = import_node_path12.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return;
  }
  loadConfig(configPath, ancestors) {
    const absolute = import_node_path12.resolve(configPath);
    const cached = this.configCache.get(absolute);
    if (cached) return cached;
    const pending = this.readConfig(absolute, ancestors);
    this.configCache.set(absolute, pending);
    return pending;
  }
  async readConfig(configPath, ancestors) {
    if (ancestors.has(configPath)) return;
    const raw = await this.paths.readJson(configPath);
    if (!raw) return;
    const nextAncestors = new Set(ancestors).add(configPath);
    let effective = {};
    const extended = typeof raw.extends === "string" ? [raw.extends] : (raw.extends ?? []);
    for (const specifier of extended) {
      const basePath = await this.resolveExtends(specifier, import_node_path12.dirname(configPath));
      if (!basePath) continue;
      const base = await this.loadConfig(basePath, nextAncestors);
      if (base) effective = { ...effective, ...base };
    }
    const options = raw.compilerOptions;
    if (!options) return effective;
    if (typeof options.baseUrl === "string") {
      effective.baseUrl = import_node_path12.resolve(
        import_node_path12.dirname(configPath),
        options.baseUrl,
      );
    }
    if (options.paths && typeof options.paths === "object") {
      const mappingBase = effective.baseUrl ?? import_node_path12.dirname(configPath);
      effective.paths = Object.entries(options.paths)
        .filter(
          (entry) =>
            Boolean(entry[0]) &&
            Array.isArray(entry[1]) &&
            entry[1].every((value) => typeof value === "string"),
        )
        .map(([pattern, targets]) => ({
          pattern,
          targets: targets.map((value) => ({ value, baseDir: mappingBase })),
        }))
        .sort(comparePathMappings);
    }
    return effective;
  }
  async resolveExtends(specifier, configDir) {
    if (specifier.startsWith(".") || import_node_path12.isAbsolute(specifier)) {
      return this.resolveConfigFile(import_node_path12.resolve(configDir, specifier));
    }
    const packageName = packageNameFromSpecifier(specifier);
    if (!packageName) return;
    const workspaceMatches = this.workspaces.packagesByName.get(packageName) ?? [];
    if (workspaceMatches.length === 1) {
      return this.resolveConfigFromPackage(workspaceMatches[0], specifier, packageName);
    }
    let current = configDir;
    while (this.paths.isInside(current)) {
      const packageDir = import_node_path12.join(
        current,
        "node_modules",
        ...packageName.split("/"),
      );
      const raw = await this.paths.readJson(import_node_path12.join(packageDir, "package.json"));
      if (raw) {
        const manifest = {
          dir: packageDir,
          relativeDir: this.paths.toProjectPath(packageDir) ?? ".",
          exports: raw.exports,
          main: raw.main,
          tsconfig: raw.tsconfig,
        };
        return this.resolveConfigFromPackage(manifest, specifier, packageName);
      }
      if (current === this.paths.root) break;
      const parent = import_node_path12.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return;
  }
  async resolveConfigFromPackage(manifest, specifier, packageName) {
    const subpath = packageSubpath(specifier, packageName);
    if (manifest.exports !== undefined) {
      const selected = selectExportsTarget(
        manifest.exports,
        subpath,
        new Set(["types", "import", "node", "default"]),
      );
      if (selected.status === "matched" && selected.target?.startsWith("./")) {
        const resolved = await this.resolveConfigFile(
          import_node_path12.resolve(manifest.dir, selected.target),
        );
        if (resolved) return resolved;
      }
    }
    const direct =
      subpath === "." ? (manifest.tsconfig ?? manifest.main ?? "tsconfig.json") : subpath.slice(2);
    return this.resolveConfigFile(import_node_path12.resolve(manifest.dir, direct));
  }
  async resolveConfigFile(requested) {
    const candidates = import_node_path12.extname(requested)
      ? [requested]
      : [requested, `${requested}.json`, import_node_path12.join(requested, "tsconfig.json")];
    for (const candidate of candidates) {
      const resolved = await this.paths.resolveExact(candidate);
      if (resolved.status === "resolved") return resolved.absolute;
    }
    return;
  }
}
function matchTypeScriptPaths(mappings, specifier) {
  const mapping = mappings?.find(({ pattern }) => pathPatternMatches(pattern, specifier));
  if (!mapping) return { matched: false, targets: [] };
  const capture = capturePathPattern(mapping.pattern, specifier);
  return {
    matched: true,
    targets: mapping.targets.map(({ value, baseDir }) =>
      import_node_path12.resolve(baseDir, value.replaceAll("*", capture)),
    ),
  };
}
function comparePathMappings(left, right) {
  const leftStar = left.pattern.indexOf("*");
  const rightStar = right.pattern.indexOf("*");
  if (leftStar === -1 || rightStar === -1) {
    if (leftStar === -1 && rightStar !== -1) return -1;
    if (leftStar !== -1 && rightStar === -1) return 1;
  }
  return (
    rightStar - leftStar ||
    right.pattern.length - left.pattern.length ||
    compareText3(left.pattern, right.pattern)
  );
}
function compareText3(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function pathPatternMatches(pattern, specifier) {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === specifier;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix) &&
    specifier.length >= prefix.length + suffix.length
  );
}
function capturePathPattern(pattern, specifier) {
  const star = pattern.indexOf("*");
  if (star === -1) return "";
  const suffixLength = pattern.length - star - 1;
  return specifier.slice(star, suffixLength === 0 ? undefined : -suffixLength);
}

// src/lib/architecture/resolution/resolver.ts
var NODE_BUILTINS = new Set(
  import_node_module.builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]),
);
var URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
var SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;
var ROUTE_TREE_SPECIFIER = /^\.\/routeTree\.gen(?:\.[cm]?[jt]sx?)?$/i;
var NEXT_ENV_SOURCE = /^(?:apps\/web\/)?next-env\.d\.ts$/;
var NEXT_GENERATED_TYPE_SPECIFIER = /^\.\/\.next\/(?:dev\/)?types\/(?:routes|root-params)\.d\.ts$/;
async function createImportResolver(root, options = {}) {
  const paths = new ProjectPathResolver(root);
  const workspaces = await discoverWorkspacePackages(paths);
  return new ProjectImportResolver(paths, workspaces, options);
}

class ProjectImportResolver {
  paths;
  configs;
  packages;
  constructor(paths, workspaces, options) {
    this.paths = paths;
    const conditions = [...new Set(options.conditions ?? ["bun", "node"])].sort();
    this.configs = new TypeScriptConfigLoader(paths, workspaces);
    this.packages = new OwnedPackageResolver(paths, workspaces, conditions);
  }
  async resolve(fromFile, reference) {
    const sourceAbsolute = this.paths.toAbsolute(fromFile);
    const source = this.paths.toProjectPath(sourceAbsolute) ?? "<outside-project>";
    const specifier = normalizePath2(stripQueryAndHash(reference.specifier.trim()));
    if (!this.paths.isInside(sourceAbsolute)) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        false,
        "source-outside-project",
      );
    }
    if (!specifier) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        false,
        "invalid-specifier",
      );
    }
    if (isRelativeSpecifier(specifier)) {
      return this.resolveRelative(sourceAbsolute, source, specifier, reference);
    }
    if (specifier === "bun" || specifier.startsWith("bun:")) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "builtin",
        false,
        "bun-builtin",
        undefined,
        "bun",
      );
    }
    if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)) {
      const packageName = specifier.replace(/^node:/, "").split("/")[0];
      return resolutionResult(
        reference,
        specifier,
        source,
        "builtin",
        false,
        "node-builtin",
        undefined,
        packageName,
      );
    }
    if (specifier.startsWith("#")) {
      return this.packages.resolvePackageImport(sourceAbsolute, source, specifier, reference);
    }
    return this.resolveBare(sourceAbsolute, source, specifier, reference);
  }
  async resolveAll(fromFile, references) {
    const resolved = await Promise.all(
      references.map((reference) => this.resolve(fromFile, reference)),
    );
    return resolved.sort(
      (left, right) =>
        left.reference.location.start - right.reference.location.start ||
        left.reference.location.end - right.reference.location.end ||
        compareText4(left.specifier, right.specifier) ||
        compareText4(left.reference.kind, right.reference.kind),
    );
  }
  async resolveRelative(sourceAbsolute, source, specifier, reference) {
    const requested = import_node_path13.resolve(
      import_node_path13.dirname(sourceAbsolute),
      specifier,
    );
    const nextGeneratedType = this.nextGeneratedTypeTarget(source, specifier, requested, reference);
    if (nextGeneratedType) return nextGeneratedType;
    const pathResolution = await this.paths.resolveModule(requested, reference.typeOnly);
    if (pathResolution.status === "resolved") {
      return resolutionResult(
        reference,
        specifier,
        source,
        "internal",
        true,
        "relative-file",
        this.paths.toProjectPath(pathResolution.absolute),
      );
    }
    if (pathResolution.status === "outside") {
      return resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "target-outside-project",
      );
    }
    const generated = this.generatedTarget(sourceAbsolute, source, specifier, requested, reference);
    if (generated) return generated;
    return resolutionResult(
      reference,
      specifier,
      source,
      "unresolved",
      true,
      "relative-target-missing",
      intendedProjectPath(this.paths, requested),
    );
  }
  async resolveBare(sourceAbsolute, source, specifier, reference) {
    if (URL_SCHEME.test(specifier)) {
      return resolutionResult(reference, specifier, source, "external", false, "external-url");
    }
    const config = await this.configs.loadNearest(sourceAbsolute);
    const aliases = matchTypeScriptPaths(config?.paths, specifier);
    let aliasFailure;
    if (aliases.matched) {
      let firstTarget;
      for (const target of aliases.targets) {
        firstTarget ??= intendedProjectPath(this.paths, target);
        const resolution = await this.paths.resolveModule(target, reference.typeOnly);
        if (resolution.status === "outside") {
          return resolutionResult(
            reference,
            specifier,
            source,
            "unresolved",
            true,
            "target-outside-project",
          );
        }
        if (resolution.status === "resolved") {
          return resolutionResult(
            reference,
            specifier,
            source,
            "internal",
            true,
            "tsconfig-path",
            this.paths.toProjectPath(resolution.absolute),
          );
        }
      }
      aliasFailure = resolutionResult(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "tsconfig-path-target-missing",
        firstTarget,
      );
    }
    if (config?.baseUrl) {
      const baseUrlTarget = import_node_path13.resolve(config.baseUrl, specifier);
      const baseUrlResolution = await this.paths.resolveModule(baseUrlTarget, reference.typeOnly);
      if (baseUrlResolution.status === "outside") {
        return resolutionResult(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "target-outside-project",
        );
      }
      if (baseUrlResolution.status === "resolved") {
        return resolutionResult(
          reference,
          specifier,
          source,
          "internal",
          true,
          "tsconfig-base-url",
          this.paths.toProjectPath(baseUrlResolution.absolute),
        );
      }
    }
    const packageResolution = await this.packages.resolvePackageSpecifier(
      sourceAbsolute,
      source,
      specifier,
      reference,
    );
    if (packageResolution.kind !== "external" || !aliasFailure) return packageResolution;
    return aliasFailure;
  }
  generatedTarget(sourceAbsolute, source, specifier, requested, reference) {
    const target = intendedProjectPath(this.paths, requested);
    const siblingRouteTree = import_node_path13.resolve(
      import_node_path13.dirname(sourceAbsolute),
      "routeTree.gen",
    );
    const normalizedTarget = import_node_path13.resolve(requested.replace(SOURCE_EXTENSION, ""));
    if (ROUTE_TREE_SPECIFIER.test(specifier) && normalizedTarget === siblingRouteTree) {
      return resolutionResult(
        reference,
        specifier,
        source,
        "generated",
        true,
        "generated-route-tree",
        target,
      );
    }
    return;
  }
  nextGeneratedTypeTarget(source, specifier, requested, reference) {
    if (!NEXT_ENV_SOURCE.test(source) || !NEXT_GENERATED_TYPE_SPECIFIER.test(specifier)) {
      return;
    }
    const target = intendedProjectPath(this.paths, requested);
    const expectedTarget =
      source === "next-env.d.ts" ? specifier.slice(2) : `apps/web/${specifier.slice(2)}`;
    if (target !== expectedTarget) return;
    return resolutionResult(
      reference,
      specifier,
      source,
      "generated",
      true,
      "generated-next-types",
      target,
    );
  }
}
function isRelativeSpecifier(specifier) {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}
function compareText4(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
// src/lib/architecture/parsers/imports.ts
var import_oxc_parser = require("oxc-parser");
function asNode(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
function literalString(value) {
  const node = asNode(value);
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}
function lineStarts(source) {
  const starts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source.charCodeAt(offset) === 10) starts.push(offset + 1);
  }
  return starts;
}
function positionAt(offset, starts) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - (starts[lineIndex] ?? 0) + 1 };
}
function sourceLocation(node, starts, sourceLength) {
  const start = Math.min(sourceLength, Math.max(0, node.start ?? 0));
  const end = Math.min(sourceLength, Math.max(start, node.end ?? start));
  const startPosition = positionAt(start, starts);
  const endPosition = positionAt(end, starts);
  return {
    start,
    end,
    line: startPosition.line,
    column: startPosition.column,
    endLine: endPosition.line,
    endColumn: endPosition.column,
  };
}
function allSpecifiersTypeOnly(node, kindKey) {
  if (node[kindKey] === "type") return true;
  const specifiers = node.specifiers;
  return (
    Array.isArray(specifiers) &&
    specifiers.length > 0 &&
    specifiers.every((specifier) => asNode(specifier)?.[kindKey] === "type")
  );
}
function parserMode(ext) {
  const normalized = ext.trim().toLowerCase().replace(/^\./, "") || "ts";
  const lang = (() => {
    if (normalized === "tsx") return "tsx";
    if (normalized === "jsx") return "jsx";
    if (normalized === "ts" || normalized === "mts" || normalized === "cts") return "ts";
    if (normalized === "d.ts") return "dts";
    if (normalized === "js" || normalized === "mjs" || normalized === "cjs") return "js";
    return;
  })();
  const sourceType =
    normalized === "cjs" || normalized === "cts"
      ? "commonjs"
      : normalized === "mjs" || normalized === "mts"
        ? "module"
        : "unambiguous";
  return { filename: `source.${normalized}`, lang, sourceType };
}
function copyDiagnostics(errors) {
  return errors.map((error) => ({
    severity: error.severity,
    message: error.message,
    labels: error.labels.map((label) => ({
      message: label.message,
      start: label.start,
      end: label.end,
    })),
    helpMessage: error.helpMessage,
    codeframe: error.codeframe,
  }));
}
function parseFile(source, ext) {
  const mode = parserMode(ext);
  const result = import_oxc_parser.parseSync(mode.filename, source, {
    sourceType: mode.sourceType,
    lang: mode.lang,
  });
  const starts = lineStarts(source);
  const collected = [];
  let order = 0;
  const addReference = (node, specifier, kind, typeOnly) => {
    if (!specifier) return;
    collected.push({
      reference: {
        specifier,
        kind,
        typeOnly,
        location: sourceLocation(node, starts, source.length),
      },
      order,
    });
    order += 1;
  };
  const stack = [result.program];
  const seen = new Set();
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const child of value) stack.push(child);
      continue;
    }
    const node = value;
    if (node.type === "ImportDeclaration") {
      addReference(
        node,
        literalString(node.source),
        "import",
        allSpecifiersTypeOnly(node, "importKind"),
      );
    } else if (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") {
      addReference(
        node,
        literalString(node.source),
        "reexport",
        allSpecifiersTypeOnly(node, "exportKind"),
      );
    } else if (node.type === "TSImportEqualsDeclaration") {
      const moduleReference = asNode(node.moduleReference);
      const expression =
        moduleReference?.type === "TSExternalModuleReference"
          ? moduleReference.expression
          : undefined;
      addReference(node, literalString(expression), "import-equals", node.importKind === "type");
    } else if (node.type === "CallExpression") {
      const callee = asNode(node.callee);
      const args = Array.isArray(node.arguments) ? node.arguments : [];
      const specifier = literalString(args[0]);
      if (callee?.type === "Identifier" && callee.name === "require") {
        addReference(node, specifier, "require", false);
      } else if (callee?.type === "Import") {
        addReference(node, specifier, "dynamic-import", false);
      }
    } else if (node.type === "ImportExpression") {
      addReference(node, literalString(node.source), "dynamic-import", false);
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "range" || key === "loc" || key === "start" || key === "end") continue;
      if (child && typeof child === "object") stack.push(child);
    }
  }
  const importReferences = collected
    .sort(
      (left, right) =>
        left.reference.location.start - right.reference.location.start ||
        left.reference.location.end - right.reference.location.end ||
        left.order - right.order,
    )
    .map(({ reference }) => reference);
  const imports = Array.from(new Set(importReferences.map(({ specifier }) => specifier)));
  const directives = new Set();
  for (const statement of result.program.body) {
    const node = asNode(statement);
    const directive =
      node?.type === "ExpressionStatement" ? literalString(asNode(node.expression)) : undefined;
    if (!directive) break;
    if (directive === "use client" || directive === "use server") directives.add(directive);
  }
  const serverActionValid =
    directives.has("use server") &&
    result.program.body.every((statement) => {
      const node = asNode(statement);
      if (
        !node ||
        (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration")
      ) {
        return true;
      }
      if (node.exportKind === "type") return true;
      const declaration = asNode(node.declaration);
      if (declaration?.type === "FunctionDeclaration") return declaration.async === true;
      if (declaration?.type === "VariableDeclaration") {
        const declarations = Array.isArray(declaration.declarations)
          ? declaration.declarations
          : [];
        return declarations.every((entry) => {
          const init = asNode(asNode(entry)?.init);
          return (
            (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") &&
            init.async === true
          );
        });
      }
      return false;
    });
  return {
    program: result.program,
    comments: result.comments,
    imports,
    importReferences,
    directives,
    serverActionValid,
    diagnostics: copyDiagnostics(result.errors),
  };
}

// src/lib/architecture/analyzer-helpers.ts
var import_node_buffer = require("node:buffer");
var import_promises10 = require("node:fs/promises");
var DEFAULT_MAX_SOURCE_FILE_BYTES = 4 * 1024 * 1024;
var DEFAULT_MAX_TOTAL_SOURCE_BYTES = 256 * 1024 * 1024;
async function readBoundedSource(file, relFile, maxFileBytes, remainingBytes, findings) {
  let source;
  try {
    source = await import_promises10.readFile(file, "utf8");
  } catch (error) {
    findings.push({
      id: "source-read-failure",
      severity: "BLOCKER",
      message: `Unable to read source file: ${errorCode2(error)}`,
      file: relFile,
      rule: "source-coverage",
    });
    return { bytes: 0 };
  }
  const bytes = import_node_buffer.Buffer.byteLength(source, "utf8");
  if (bytes > maxFileBytes) {
    findings.push({
      id: "source-file-size-limit",
      severity: "BLOCKER",
      message: `Source file exceeds the ${maxFileBytes}-byte analysis limit`,
      file: relFile,
      rule: "source-coverage",
    });
    return { bytes };
  }
  if (bytes > remainingBytes) {
    findings.push({
      id: "source-total-size-limit",
      severity: "BLOCKER",
      message: "Total source byte budget exhausted before analysis completed",
      file: relFile,
      rule: "source-coverage",
    });
    return { bytes };
  }
  return { source, bytes };
}
function parserFindings(findings, file, source, parsed) {
  for (const diagnostic of parsed.diagnostics) {
    const start = diagnostic.labels[0]?.start ?? 0;
    const position = sourcePosition(source, start);
    findings.push({
      id: "parse-error",
      severity: "BLOCKER",
      message: `Unable to parse source: ${diagnostic.message.replace(/\s+/g, " ").trim()}`,
      file,
      rule: "parseable-source",
      ...position,
    });
  }
}
function isAnalysisIncomplete(finding) {
  return (
    finding.id === "project-root-unavailable" ||
    finding.id === "parse-error" ||
    finding.id === "unresolved-owned-import" ||
    finding.rule === "source-coverage" ||
    finding.rule === "source-collection" ||
    finding.rule === "package-discovery"
  );
}
function sourcePosition(source, offset) {
  const prefix = source.slice(0, Math.max(0, offset));
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
function errorCode2(error) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code ?? "UNKNOWN");
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

// src/lib/architecture/frontend/policy.ts
var DEFAULT_FRONTEND_OWNERSHIP_POLICY = Object.freeze({
  schemaVersion: 1,
  workflow: Object.freeze({ maxCodeLines: 200, maxReturnedFields: 20 }),
  infrastructure: Object.freeze([
    "src/components/providers.tsx",
    "src/components/query-auth-boundary.tsx",
    "src/components/request-owned-snapshot.tsx",
    "src/components/providers/convex-client-provider.tsx",
    "src/components/convex-client-provider.tsx",
    "src/renderer/components/providers.tsx",
    "src/renderer/components/query-auth-boundary.tsx",
    "src/renderer/lib/providers.tsx",
  ]),
});
function validateFrontendOwnershipPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Frontend ownership policy must be an object"];
  }
  const policy = value;
  const errors = [];
  if (policy.schemaVersion !== 1) errors.push("Unsupported frontend ownership policy version");
  const workflow = policy.workflow;
  if (workflow?.maxCodeLines !== 200 || workflow?.maxReturnedFields !== 20) {
    errors.push("Workflow budgets must be 200 code lines and 20 returned fields");
  }
  if (
    !Array.isArray(policy.infrastructure) ||
    JSON.stringify(policy.infrastructure) !==
      JSON.stringify(DEFAULT_FRONTEND_OWNERSHIP_POLICY.infrastructure)
  ) {
    errors.push("Infrastructure exceptions must match the reviewed exact path list");
  }
  const allowed = new Set(["$schema", "schemaVersion", "workflow", "infrastructure"]);
  if (Object.keys(policy).some((key) => !allowed.has(key))) errors.push("Unknown policy property");
  if (
    workflow &&
    Object.keys(workflow).some((key) => !["maxCodeLines", "maxReturnedFields"].includes(key))
  ) {
    errors.push("Unknown workflow policy property");
  }
  return errors;
}

// src/lib/architecture/frontend/classify.ts
function normalizeFrontendPath(file) {
  return file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}
function isFrontendIdentityModelFile(file) {
  return /^(?:apps\/[^/]+\/)?src\/(?:renderer\/)?lib\/auth-(?:model|validation)\.[cm]?[jt]s$/.test(
    normalizeFrontendPath(file),
  );
}
function classifyFrontendFile(file, _source, policy = DEFAULT_FRONTEND_OWNERSHIP_POLICY) {
  const path = normalizeFrontendPath(file);
  if (
    !/\.[cm]?[jt]sx?$/.test(path) ||
    /(?:^|\/)(?:__tests__|tests)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$/.test(path)
  )
    return "other";
  if (path.startsWith("packages/ui/src/")) return "primitive";
  const app = path.replace(/^apps\/[^/]+\//, "");
  if (policy.infrastructure.includes(app)) return "infrastructure";
  if (isFrontendIdentityModelFile(path)) return "model";
  if (/^src\/(?:renderer\/)?(?:platform\/ui|components\/ui|components\/form-fields)\//.test(app))
    return "primitive";
  const feature = /^src\/(?:renderer\/)?features\/[^/]+\/(.+)$/.exec(app)?.[1];
  if (feature) {
    if (feature.startsWith("components/")) return "view";
    if (/^(?:queries|mutations)\.[cm]?[jt]s$/.test(feature)) return "adapter";
    if (/^use-[^/]+\.[cm]?[jt]s$/.test(feature)) return "workflow";
    if (!feature.includes("/") && /\.[jt]sx$/.test(feature)) return "composition";
    return "model";
  }
  if (/^(?:src\/)?app\/api\/|^src\/routes\/api(?:[/.]|$)/.test(app)) return "other";
  if (/^(?:(?:src\/)?app\/|src\/routes\/)/.test(app)) return "route";
  if (/^src\/(?:renderer\/)?components\//.test(app)) return "view";
  if (/^src\/(?:renderer\/)?(?:App|main|index)\.[jt]sx$/.test(app)) return "route";
  return "other";
}
function isRemoteImport(specifier) {
  const path = normalizeFrontendPath(specifier);
  return (
    /^(?:@tanstack\/react-query|@apollo\/client|@orpc\/|axios(?:\/|$)|better-auth(?:\/|$)|convex(?:\/|$)|graphql-request(?:\/|$)|got(?:\/|$)|ky(?:\/|$)|swr(?:\/|$)|undici(?:\/|$)|urql(?:\/|$))/.test(
      path,
    ) ||
    /(?:^|\/)lib\/(?:orpc|api-client|auth-client|query-client|realtime)(?:\.[cm]?[jt]sx?)?$/.test(
      path,
    ) ||
    path.includes("convex/_generated/api")
  );
}
function isFormImport(specifier) {
  return /^(?:@tanstack\/react-form|react-hook-form|formik|@formkit\/)(?:\/|$)?/.test(specifier);
}
function importedFeatureRole(specifier, target) {
  if (target) return classifyFrontendFile(target);
  const path = normalizeFrontendPath(specifier);
  if (/(?:^|\/)(?:queries|mutations)(?:\.[cm]?[jt]sx?)?$/.test(path)) return "adapter";
  if (/(?:^|\/)use-[^/]+(?:\.[cm]?[jt]s)?$/.test(path)) return "workflow";
  return "other";
}

// src/lib/architecture/frontend/ast.ts
function node(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "type" in value
    ? value
    : undefined;
}
function nodes(value) {
  return Array.isArray(value) ? value.map(node).filter((entry) => entry !== undefined) : [];
}
function name(value) {
  const item = node(value);
  if (item?.type === "Identifier" || item?.type === "JSXIdentifier") return String(item.name);
  if (item?.type === "Literal" && typeof item.value === "string") return item.value;
  return;
}
function unwrap(value) {
  let item = node(value);
  while (
    item &&
    [
      "TSAsExpression",
      "TSSatisfiesExpression",
      "TSNonNullExpression",
      "TSTypeAssertion",
      "ChainExpression",
      "ParenthesizedExpression",
    ].includes(item.type ?? "")
  )
    item = node(item.expression);
  return item;
}
function children(value) {
  const result = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        "parent",
        "loc",
        "range",
        "typeAnnotation",
        "typeParameters",
        "typeArguments",
        "returnType",
        "comments",
      ].includes(key)
    )
      continue;
    if (Array.isArray(child)) result.push(...nodes(child));
    else {
      const item = node(child);
      if (item) result.push(item);
    }
  }
  return result;
}
function walk(value, visit, skipFunctions = false) {
  const root = node(value);
  if (!root) return;
  const stack = [{ item: root }];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    visit(current.item, current.parent);
    if (skipFunctions && current.item !== root && isFunction(current.item)) continue;
    for (const child of children(current.item).reverse())
      stack.push({ item: child, parent: current.item });
  }
}
function isFunction(item) {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(
    item.type ?? "",
  );
}
function staticMember(item) {
  if (!item.computed) return name(item.property);
  const property = node(item.property);
  return property?.type === "Literal" && typeof property.value === "string"
    ? property.value
    : undefined;
}

// src/lib/architecture/frontend/bindings.ts
class FrontendBindings {
  scopes = new WeakMap();
  parents = new WeakMap();
  declarations = [];
  constructor(program) {
    const root = node(program);
    if (root) this.collect(root, { bindings: new Map(), functionScope: true });
  }
  parent(item) {
    return this.parents.get(item);
  }
  lookup(identifier) {
    const key = name(identifier);
    let scope = this.scopes.get(identifier);
    while (scope && key) {
      const binding = scope.bindings.get(key);
      if (binding) return binding;
      scope = scope.parent;
    }
    return;
  }
  origin(value, seen = new Set()) {
    const item = unwrap(value);
    if (!item) return;
    if (item.type === "Identifier") {
      const binding = this.lookup(item);
      if (!binding) {
        const identifier = name(item);
        return identifier &&
          [
            "fetch",
            "WebSocket",
            "EventSource",
            "XMLHttpRequest",
            "FileReader",
            "URL",
            "globalThis",
            "window",
            "self",
          ].includes(identifier)
          ? { module: "global", path: [identifier] }
          : undefined;
      }
      if (binding.imported) return binding.imported;
      if (seen.has(binding)) return;
      seen.add(binding);
      const origin = this.origin(binding.initializer, seen);
      return origin ? { ...origin, path: [...origin.path, ...binding.projection] } : undefined;
    }
    if (item.type === "MemberExpression") {
      const origin = this.origin(item.object, seen);
      if (!origin) return;
      const member = staticMember(item);
      return {
        ...origin,
        path: [...origin.path, member ?? "*"],
        opaque: origin.opaque || member === undefined,
      };
    }
    if (item.type === "CallExpression") {
      const callee = node(item.callee);
      if (callee?.type === "Identifier" && callee.name === "require" && !this.lookup(callee)) {
        const module2 = name(nodes(item.arguments)[0]);
        return module2 ? { module: module2, path: [] } : undefined;
      }
    }
    if (item.type === "AwaitExpression") return this.origin(item.argument, seen);
    if (item.type === "ImportExpression") {
      const module2 = name(item.source);
      return module2 ? { module: module2, path: [] } : undefined;
    }
    return;
  }
  define(pattern, scope, declaration, initializer, projection = [], parameter = false) {
    const item = node(pattern);
    if (!item) return;
    if (item.type === "Identifier") {
      const binding = {
        name: String(item.name),
        declaration,
        initializer,
        projection,
        parameter,
      };
      scope.bindings.set(binding.name, binding);
      this.declarations.push(binding);
    } else if (item.type === "ObjectPattern") {
      for (const property of nodes(item.properties)) {
        if (property.type === "RestElement")
          this.define(
            property.argument,
            scope,
            declaration,
            initializer,
            [...projection, "*"],
            parameter,
          );
        else
          this.define(
            property.value,
            scope,
            declaration,
            initializer,
            [...projection, name(property.key) ?? "*"],
            parameter,
          );
      }
    } else if (item.type === "ArrayPattern") {
      for (const [index, element] of (Array.isArray(item.elements) ? item.elements : []).entries())
        this.define(
          element,
          scope,
          declaration,
          initializer,
          [...projection, String(index)],
          parameter,
        );
    } else if (item.type === "AssignmentPattern")
      this.define(item.left, scope, declaration, initializer, projection, parameter);
    else if (item.type === "RestElement")
      this.define(item.argument, scope, declaration, initializer, projection, parameter);
  }
  collect(item, outer, parent) {
    let scope = outer;
    if (parent) this.parents.set(item, parent);
    if (item.type === "FunctionDeclaration" || item.type === "ClassDeclaration")
      this.define(item.id, outer, item);
    if (isFunction(item)) {
      scope = { parent: outer, bindings: new Map(), functionScope: true };
      if (item.type === "FunctionExpression") this.define(item.id, scope, item);
      for (const param of nodes(item.params)) this.define(param, scope, item, undefined, [], true);
    } else if (
      [
        "BlockStatement",
        "CatchClause",
        "ForStatement",
        "ForOfStatement",
        "ForInStatement",
        "SwitchStatement",
      ].includes(item.type ?? "")
    ) {
      scope = { parent: outer, bindings: new Map(), functionScope: false };
      if (item.type === "CatchClause") this.define(item.param, scope, item, undefined, [], true);
    }
    this.scopes.set(item, scope);
    if (item.type === "ImportDeclaration" && item.importKind !== "type") {
      const module2 = name(item.source);
      if (module2)
        for (const specifier of nodes(item.specifiers)) {
          if (specifier.importKind === "type") continue;
          const local = node(specifier.local);
          if (!local) continue;
          this.define(local, scope, specifier);
          const binding = scope.bindings.get(String(local.name));
          if (binding)
            binding.imported = {
              module: module2,
              path: specifier.type === "ImportSpecifier" ? [name(specifier.imported) ?? "*"] : [],
            };
        }
    }
    if (item.type === "TSImportEqualsDeclaration" && item.importKind !== "type") {
      const module2 = name(node(item.moduleReference)?.expression);
      const local = node(item.id);
      if (module2 && local) {
        this.define(local, scope, item);
        const binding = scope.bindings.get(String(local.name));
        if (binding) binding.imported = { module: module2, path: [] };
      }
    }
    if (item.type === "VariableDeclarator") {
      let destination = scope;
      if (parent?.kind === "var")
        while (!destination.functionScope && destination.parent) destination = destination.parent;
      this.define(item.id, destination, item, node(item.init));
    }
    for (const child of children(item)) this.collect(child, scope, item);
  }
}

// src/lib/architecture/frontend/import-facts.ts
function frontendImportFacts(program, resolved = []) {
  const result = [...resolved];
  walk(program, (item) => {
    let specifier;
    let typeOnly = false;
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(
        item.type ?? "",
      )
    ) {
      specifier = name(item.source);
      const kind = item.type === "ImportDeclaration" ? "importKind" : "exportKind";
      const specifiers = nodes(item.specifiers);
      typeOnly =
        item[kind] === "type" ||
        (specifiers.length > 0 && specifiers.every((entry) => entry[kind] === "type"));
    } else if (item.type === "ImportExpression") specifier = name(item.source);
    else if (item.type === "CallExpression" && name(item.callee) === "require")
      specifier = name(nodes(item.arguments)[0]);
    else if (item.type === "TSImportEqualsDeclaration") {
      specifier = name(node(item.moduleReference)?.expression);
      typeOnly = item.importKind === "type";
    }
    if (
      specifier &&
      !result.some((entry) => entry.specifier === specifier && entry.typeOnly === typeOnly)
    )
      result.push({ specifier, typeOnly });
  });
  return result;
}

// src/lib/architecture/frontend/context.ts
function createFrontendContext(input) {
  const policy = input.policy ?? DEFAULT_FRONTEND_OWNERSHIP_POLICY;
  const findings = [];
  const seen = new Set();
  const starts = [0];
  for (let index = 0; index < input.source.length; index++)
    if (
      input.source[index] ===
      `
`
    )
      starts.push(index + 1);
  return {
    ...input,
    imports: frontendImportFacts(input.program, input.imports),
    policy,
    role: classifyFrontendFile(input.file, input.source, policy),
    bindings: new FrontendBindings(input.program),
    findings,
    add(id, message, item) {
      const offset = item?.start ?? 0;
      const key = `${id}:${offset}`;
      if (seen.has(key)) return;
      seen.add(key);
      let low = 0;
      let high = starts.length - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        if ((starts[middle] ?? 0) <= offset) low = middle + 1;
        else high = middle - 1;
      }
      const line = Math.max(0, high);
      findings.push({
        id,
        message,
        file: input.file,
        severity: "HIGH",
        rule: "frontend-ownership",
        line: line + 1,
        column: offset - (starts[line] ?? 0) + 1,
      });
    },
  };
}

// src/lib/architecture/frontend/ownership.ts
var LIFETIME_HOOKS = new Set([
  "useState",
  "useReducer",
  "useEffect",
  "useLayoutEffect",
  "useInsertionEffect",
  "useRef",
  "useSyncExternalStore",
  "useActionState",
  "useOptimistic",
  "useImperativeHandle",
]);
var FORM_HOOKS = new Set([
  "useAppForm",
  "useForm",
  "useFormik",
  "useFormContext",
  "useFieldArray",
  "useWatch",
]);
function globalNetwork(origin) {
  if (origin.module !== "global") return false;
  return (
    ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"].includes(origin.path[0] ?? "") ||
    (["window", "globalThis", "self"].includes(origin.path[0] ?? "") &&
      (origin.opaque === true ||
        ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"].includes(origin.path[1] ?? "")))
  );
}
function globalFileReader(origin) {
  if (origin.module !== "global") return false;
  const path = ["window", "globalThis", "self"].includes(origin.path[0] ?? "")
    ? origin.path.slice(1)
    : origin.path;
  return (
    path[0] === "FileReader" &&
    (path.length === 1 || (path.length === 2 && ["bind", "call", "apply"].includes(path[1] ?? "")))
  );
}
function serverRouteRead(context, call) {
  if (context.role !== "route") return false;
  for (const statement of nodes(node(context.program)?.body)) {
    const directive =
      statement.type === "ExpressionStatement" ? node(statement.expression)?.value : undefined;
    if (typeof directive !== "string") break;
    if (directive === "use client") return false;
  }
  let current = context.bindings.parent(call);
  while (current) {
    if (isFunction(current)) {
      const parent = context.bindings.parent(current);
      if (parent?.type === "Property" && ["loader", "beforeLoad"].includes(name(parent.key) ?? ""))
        return true;
      if (!current.async) return false;
      if (parent?.type === "ExportDefaultDeclaration") return true;
      if (
        parent?.type === "ExportNamedDeclaration" &&
        /^(?:generateMetadata|generateStaticParams|getServerSideProps|getStaticProps)$/.test(
          name(current.id) ?? "",
        )
      )
        return true;
      return false;
    }
    current = context.bindings.parent(current);
  }
  return false;
}
function importNode(program, specifier) {
  let found;
  walk(program, (item) => {
    if (name(item.source) === specifier && !found) found = item;
  });
  return found;
}
function checkFrontendOwnership(context) {
  const { role } = context;
  const composition = role === "route" || role === "composition";
  const pure = role === "model";
  const view = role === "view";
  for (const reference of context.imports ?? []) {
    if (reference.typeOnly) continue;
    const source = importNode(context.program, reference.specifier);
    const targetRole = importedFeatureRole(reference.specifier, reference.target);
    if (
      isRemoteImport(reference.specifier) ||
      (reference.target && isRemoteImport(reference.target))
    ) {
      if (role !== "adapter")
        context.add(
          "frontend-remote-owner",
          "Remote clients and query/mutation libraries belong in feature-root queries.ts or mutations.ts.",
          source,
        );
    }
    if ((view || pure) && (targetRole === "adapter" || targetRole === "workflow")) {
      context.add(
        pure ? "frontend-model-purity" : "frontend-view-workflow",
        "Views receive typed props; pure models cannot import feature adapters or workflow hooks.",
        source,
      );
    }
    if (pure && reference.specifier === "react")
      context.add(
        "frontend-model-purity",
        "Pure feature models may import React types, but cannot own React runtime behavior.",
        source,
      );
    if (pure && /^(?:node:|bun:|next\/(?:headers|server)$)/.test(reference.specifier)) {
      context.add(
        "frontend-model-purity",
        "Pure frontend models cannot import server runtime implementations.",
        source,
      );
    }
    if (
      isFormImport(reference.specifier) &&
      !(
        role === "workflow" &&
        context.platform === "expo" &&
        reference.specifier === "@tanstack/react-form"
      )
    )
      context.add(
        "frontend-form-owner",
        "Raw form libraries belong in the shared form foundation; feature workflows compose useAppForm.",
        source,
      );
  }
  walk(context.program, (item, parent) => {
    if (
      ["Identifier", "MemberExpression"].includes(item.type ?? "") &&
      !parent?.type?.startsWith("Import")
    ) {
      const reference = context.bindings.origin(item);
      if (
        reference?.module === "react" &&
        (reference.opaque || reference.path.some((part) => LIFETIME_HOOKS.has(part))) &&
        (composition || pure)
      ) {
        context.add(
          pure ? "frontend-model-purity" : "frontend-view-workflow",
          "Raw React state/effect references belong in semantic workflow hooks, including callable aliases and computed access.",
          item,
        );
      }
    }
    if (item.type !== "CallExpression" && item.type !== "NewExpression") return;
    const callee = unwrap(item.callee);
    const origin = context.bindings.origin(callee);
    const method = origin?.path.at(-1) ?? name(callee);
    if (origin && globalFileReader(origin) && (pure || view || composition)) {
      context.add(
        pure ? "frontend-model-purity" : "frontend-view-workflow",
        "Browser file reads belong in feature adapters or workflow hooks, outside pure models and presentation.",
        item,
      );
    }
    if (origin?.module === "react" && (LIFETIME_HOOKS.has(method ?? "") || origin.opaque)) {
      if (composition || pure)
        context.add(
          pure ? "frontend-model-purity" : "frontend-view-workflow",
          "Routes and feature composition files compose semantic hooks; state, effects and resource lifetimes belong in workflow hooks.",
          item,
        );
    }
    if (origin?.module === "react" && pure)
      context.add(
        "frontend-model-purity",
        "Pure feature models cannot call React runtime APIs.",
        item,
      );
    if (FORM_HOOKS.has(method ?? "") && (origin || /^useAppForm$/.test(method ?? ""))) {
      if (role !== "workflow")
        context.add(
          "frontend-form-owner",
          "Form state and submission belong in a feature workflow hook using useAppForm.",
          item,
        );
      else if (
        method !== "useAppForm" &&
        !(
          context.platform === "expo" &&
          origin?.module === "@tanstack/react-form" &&
          method === "useForm"
        )
      )
        context.add(
          "frontend-form-owner",
          "Feature form workflows must compose the shared useAppForm foundation.",
          item,
        );
    }
    if (origin && globalNetwork(origin) && role !== "adapter" && !serverRouteRead(context, item)) {
      context.add(
        "frontend-remote-owner",
        "Network operations belong in feature-root queries.ts or mutations.ts, or an explicit server route loader.",
        item,
      );
    }
    if (pure && origin && (isRemoteImport(origin.module) || isFormImport(origin.module)))
      context.add(
        "frontend-model-purity",
        "Pure feature models cannot own remote or form runtime behavior.",
        item,
      );
    if (
      (view || pure) &&
      method &&
      /^use[A-Z]/.test(method) &&
      origin &&
      importedFeatureRole(origin.module) === "workflow"
    ) {
      context.add(
        pure ? "frontend-model-purity" : "frontend-view-workflow",
        "Feature workflow hooks are composed by feature containers, not prop-driven views or pure models.",
        item,
      );
    }
  });
}

// src/lib/architecture/frontend/events.ts
function isRealtimeEventSetter(context, call, effect) {
  const effectCallback = nodes(effect.arguments)[0];
  let callback = context.bindings.parent(call);
  while (callback && !isFunction(callback)) callback = context.bindings.parent(callback);
  if (!callback || callback === effectCallback) return false;
  const parameters = context.bindings.declarations.filter(
    (binding) => binding.parameter && binding.declaration === callback,
  );
  let consumesEvent = false;
  walk(nodes(call.arguments)[0], (item, parent) => {
    if (parent?.type === "MemberExpression" && parent.property === item && !parent.computed) return;
    if (parent?.type === "Property" && parent.key === item && !parent.computed && !parent.shorthand)
      return;
    if (item.type === "Identifier" && parameters.includes(context.bindings.lookup(item)))
      consumesEvent = true;
  });
  if (!consumesEvent) return false;
  let subscribed = false;
  walk(effectCallback, (item) => {
    if (item.type !== "CallExpression") return;
    const origin = context.bindings.origin(item.callee);
    if (
      origin?.path.at(-1) !== "subscribeRealtime" ||
      !/(?:^|\/)lib\/realtime(?:\.[cm]?[jt]s)?$/.test(origin.module)
    )
      return;
    for (const argument of nodes(item.arguments)) {
      const binding =
        argument.type === "Identifier" ? context.bindings.lookup(argument) : undefined;
      if (
        argument === callback ||
        binding?.initializer === callback ||
        binding?.declaration === callback
      )
        subscribed = true;
    }
  });
  return subscribed;
}

// src/lib/architecture/frontend/state.ts
function reactCall(context, expression, methods) {
  const item = unwrap(expression);
  if (item?.type !== "CallExpression") return;
  const origin = context.bindings.origin(item.callee);
  return origin?.module === "react" && methods.includes(origin.path.at(-1) ?? "")
    ? item
    : undefined;
}
function remoteValue(context, expression, seen = new Set()) {
  const item = unwrap(expression);
  if (!item) return false;
  if (item.type === "Identifier") {
    const binding = context.bindings.lookup(item);
    if (!binding || seen.has(binding)) return false;
    seen.add(binding);
    return remoteValue(context, binding.initializer, seen);
  }
  if (item.type === "CallExpression") {
    const origin = context.bindings.origin(item.callee);
    if (origin?.module === "global" && origin.path.join(".") === "URL.createObjectURL")
      return false;
    const method = origin?.path.at(-1) ?? "";
    if (
      origin &&
      (isRemoteImport(origin.module) ||
        importedFeatureRole(origin.module) === "adapter" ||
        ["useLoaderData", "useRouteContext"].includes(method))
    )
      return true;
    if (origin?.module === "global" && origin.path.at(-1) === "fetch") return true;
    if (
      node(item.callee)?.type === "MemberExpression" &&
      remoteValue(context, node(item.callee)?.object, seen)
    )
      return true;
    return nodes(item.arguments).some((argument) => remoteValue(context, argument, new Set(seen)));
  }
  if (item.type === "MemberExpression") return remoteValue(context, item.object, seen);
  if (item.type === "AwaitExpression") return remoteValue(context, item.argument, seen);
  if (isFunction(item)) {
    const body = node(item.body);
    if (body?.type !== "BlockStatement") return remoteValue(context, body, seen);
    let tainted = false;
    walk(
      body,
      (child) => {
        if (child.type === "ReturnStatement" && remoteValue(context, child.argument, new Set(seen)))
          tainted = true;
      },
      true,
    );
    return tainted;
  }
  if (
    [
      "ObjectExpression",
      "ArrayExpression",
      "ConditionalExpression",
      "LogicalExpression",
      "BinaryExpression",
      "TemplateLiteral",
    ].includes(item.type ?? "")
  ) {
    let tainted = false;
    walk(item, (child) => {
      if (
        child !== item &&
        child.type === "Identifier" &&
        remoteValue(context, child, new Set(seen))
      )
        tainted = true;
    });
    return tainted;
  }
  return false;
}
function selectionScalar(expression, stateName) {
  if (!/^(?:selected|active|focused|expanded|open|defaultOpen)(?:[A-Z_]|$)/.test(stateName))
    return false;
  const item = unwrap(expression);
  return (
    item?.type === "MemberExpression" && /^(?:id|key|open|expanded)$/.test(staticMember(item) ?? "")
  );
}
function localStates(context) {
  const result = [];
  for (const binding of context.bindings.declarations) {
    if (binding.projection[0] !== "0") continue;
    const call = reactCall(context, binding.initializer, ["useState", "useReducer"]);
    if (!call) continue;
    const setter = context.bindings.declarations.find(
      (candidate) =>
        candidate.declaration === binding.declaration && candidate.projection[0] === "1",
    );
    result.push({ value: binding, setter, call });
  }
  return result;
}
function refersTo(context, expression, binding) {
  let found = false;
  walk(expression, (item) => {
    if (item.type === "Identifier" && context.bindings.lookup(item) === binding) found = true;
  });
  return found;
}
function reactiveDerivation(context, expression, effect) {
  const item = unwrap(expression);
  if (!item || item.type === "Literal") return false;
  let reactive = false;
  walk(item, (child, parent) => {
    if (child.type !== "Identifier") return;
    if (parent?.type === "MemberExpression" && parent.property === child && !parent.computed)
      return;
    if (
      parent?.type === "Property" &&
      parent.key === child &&
      !parent.computed &&
      !parent.shorthand
    )
      return;
    const binding = context.bindings.lookup(child);
    if (!binding) return;
    const start = binding.declaration.start ?? 0;
    if (start >= (effect.start ?? 0) && start <= (effect.end ?? 0)) return;
    if (node(binding.initializer)?.type === "Literal") return;
    if (
      binding.parameter ||
      reactCall(context, binding.initializer, ["useState", "useReducer"]) ||
      remoteValue(context, child)
    )
      reactive = true;
  });
  return reactive;
}
function checkFrontendState(context) {
  const states = localStates(context);
  for (const state of states) {
    const args = nodes(state.call.arguments);
    const origin = context.bindings.origin(state.call.callee);
    const initial = args[origin?.path.at(-1) === "useReducer" ? 1 : 0];
    if (remoteValue(context, initial) && !selectionScalar(initial, state.value.name))
      context.add(
        "frontend-server-state-copy",
        "Keep remote data in its query/loader owner; derive it during render instead of copying it into React state.",
        state.call,
      );
  }
  walk(context.program, (item) => {
    const effect = reactCall(context, item, ["useEffect", "useLayoutEffect", "useInsertionEffect"]);
    if (effect) {
      const callback = nodes(effect.arguments)[0];
      walk(callback, (call) => {
        if (call.type !== "CallExpression") return;
        const callee = unwrap(call.callee);
        if (callee?.type !== "Identifier") return;
        const setter = context.bindings.lookup(callee);
        const state = states.find((entry) => entry.setter === setter);
        if (!state) return;
        const next = nodes(call.arguments)[0];
        if (
          remoteValue(context, next) ||
          (reactiveDerivation(context, next, effect) &&
            !isRealtimeEventSetter(context, call, effect))
        )
          context.add(
            "frontend-derived-effect-state",
            "Do not synchronize derived props, query data or React state into another state value in an effect; derive during render.",
            call,
          );
      });
    }
    if (context.role !== "view" || item.type !== "JSXAttribute") return;
    const opening = context.bindings.parent(item);
    if (opening?.type !== "JSXOpeningElement") return;
    const tag = name(opening.name);
    if (!["input", "Input", "textarea", "Textarea", "TextInput"].includes(tag ?? "")) return;
    const type = nodes(opening.attributes).find((attribute) => name(attribute.name) === "type");
    const inputType = node(type?.value)?.value;
    if (["checkbox", "radio", "range", "button", "submit", "reset"].includes(String(inputType)))
      return;
    const attribute = name(item.name);
    if (
      ![
        "value",
        "checked",
        "onChange",
        "onChangeText",
        "onValueChange",
        "onCheckedChange",
      ].includes(attribute ?? "")
    )
      return;
    for (const state of states) {
      if (
        refersTo(context, item.value, state.value) ||
        (state.setter && refersTo(context, item.value, state.setter))
      )
        context.add(
          "frontend-form-owner",
          "Controlled form field state belongs in a workflow using useAppForm; pass field state and callbacks to this view.",
          item,
        );
    }
  });
}

// src/lib/architecture/frontend/budget.ts
function codeLines(source, comments) {
  const chars = source.split("");
  for (const value of comments) {
    if (!value || typeof value !== "object") continue;
    const comment = value;
    if (typeof comment.start !== "number" || typeof comment.end !== "number") continue;
    for (let index = comment.start; index < comment.end; index++)
      if (
        chars[index] !==
          `
` &&
        chars[index] !== "\r"
      )
        chars[index] = " ";
  }
  return chars
    .join("")
    .split(/\r?\n/)
    .filter((line) => line.trim()).length;
}
function fields(context, expression, seen = new Set()) {
  const item = unwrap(expression);
  if (!item || seen.has(item)) return 0;
  seen.add(item);
  if (item.type === "ObjectExpression")
    return nodes(item.properties).filter((property) => property.type === "Property").length;
  if (item.type === "Identifier")
    return fields(context, context.bindings.lookup(item)?.initializer, seen);
  if (item.type === "ConditionalExpression")
    return Math.max(fields(context, item.consequent, seen), fields(context, item.alternate, seen));
  return 0;
}
function checkWorkflowBudget(context) {
  if (context.role !== "workflow") return;
  const lines = codeLines(context.source, context.comments ?? []);
  if (lines > context.policy.workflow.maxCodeLines)
    context.add(
      "frontend-workflow-budget",
      `Workflow file has ${lines} code lines; split cohesive responsibilities to stay within ${context.policy.workflow.maxCodeLines}.`,
    );
  walk(context.program, (item, parent) => {
    if (!isFunction(item)) return;
    const hookName =
      name(item.id) ?? (parent?.type === "VariableDeclarator" ? name(parent.id) : undefined);
    if (!hookName || !/^use[A-Z]/.test(hookName)) return;
    const body = node(item.body);
    const returns = body?.type === "BlockStatement" ? [] : [body];
    if (body?.type === "BlockStatement")
      walk(
        body,
        (statement) => {
          if (statement.type === "ReturnStatement") returns.push(node(statement.argument));
        },
        true,
      );
    for (const returned of returns) {
      const count = fields(context, returned);
      if (count > context.policy.workflow.maxReturnedFields)
        context.add(
          "frontend-workflow-budget",
          `Workflow ${hookName} returns ${count} explicit fields; expose a focused contract of at most ${context.policy.workflow.maxReturnedFields}.`,
          returned,
        );
    }
  });
}

// src/lib/architecture/frontend/index.ts
function analyzeFrontendFile(input) {
  const context = createFrontendContext(input);
  const policyErrors = validateFrontendOwnershipPolicy(context.policy);
  if (policyErrors.length) {
    context.add("frontend-policy-invalid", policyErrors.join("; "));
    return context.findings;
  }
  if (["other", "primitive", "infrastructure"].includes(context.role)) return [];
  checkFrontendOwnership(context);
  checkFrontendState(context);
  checkWorkflowBudget(context);
  return context.findings;
}

// src/lib/architecture/frontend/runner.ts
async function analyzeFrontendProject(root) {
  const findings = [];
  const canonicalRoot = await import_promises11.realpath(root);
  const packages = await discoverPackages(canonicalRoot, findings);
  const files = await collectSourceFiles(canonicalRoot, packages, findings);
  const resolver = await createImportResolver(canonicalRoot);
  let totalBytes = 0;
  for (const absolute of files) {
    const file = normalizePath(import_node_path14.relative(canonicalRoot, absolute));
    const bounded = await readBoundedSource(
      absolute,
      file,
      DEFAULT_MAX_SOURCE_FILE_BYTES,
      DEFAULT_MAX_TOTAL_SOURCE_BYTES - totalBytes,
      findings,
    );
    totalBytes += bounded.bytes;
    if (!bounded.source) {
      if (findings.some(({ id }) => id === "source-total-size-limit")) break;
      continue;
    }
    let parsed;
    try {
      parsed = parseFile(bounded.source, import_node_path14.extname(file));
    } catch {
      findings.push({
        id: "parse-error",
        severity: "BLOCKER",
        message: "Unable to parse maintained source",
        file,
        rule: "parseable-source",
      });
      continue;
    }
    parserFindings(findings, file, bounded.source, parsed);
    if (parsed.diagnostics.length || classifyFrontendFile(file) === "other") continue;
    const imports = await resolver.resolveAll(absolute, parsed.importReferences);
    const pkg = packageForFile(absolute, packages);
    findings.push(
      ...analyzeFrontendFile({
        file,
        source: bounded.source,
        program: parsed.program,
        comments: parsed.comments,
        platform:
          pkg?.dependencies.has("expo") && pkg.dependencies.has("react-native") ? "expo" : "web",
        imports: imports.map(({ specifier, target, reference }) => ({
          specifier,
          target,
          typeOnly: reference.typeOnly,
        })),
      }),
    );
  }
  return { complete: !findings.some(isAnalysisIncomplete), findings, files: files.length };
}
