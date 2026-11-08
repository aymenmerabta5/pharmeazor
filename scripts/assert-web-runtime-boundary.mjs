import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ROOT_NODE_MODULES = join(ROOT, "node_modules");
const NATIVE_ONLY_NAMES = new Set([
  "@better-auth/expo",
  "electron",
  "electron-builder",
  "electron-store",
  "electron-updater",
  "electron-vite",
  "expo",
  "react-native",
  "uniwind",
]);
const NATIVE_ONLY_PREFIXES = [
  "@electron/",
  "@expo/",
  "@react-native/",
  "@react-native-",
  "expo-",
  "react-native-",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function packageManifests(packageRoot) {
  if (!existsSync(packageRoot)) return [];
  const manifests = [];
  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (entry.name === ".bin" || entry.name === ".bun") continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith("@")) {
      const scopeRoot = join(packageRoot, entry.name);
      if (!existsSync(scopeRoot)) continue;
      for (const scoped of readdirSync(scopeRoot, { withFileTypes: true })) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) {
          manifests.push(join(scopeRoot, scoped.name, "package.json"));
        }
      }
    } else {
      manifests.push(join(packageRoot, entry.name, "package.json"));
    }
  }
  return manifests;
}

if (!existsSync(ROOT_NODE_MODULES)) {
  fail("Web runtime dependency boundary is missing node_modules");
}

const packageRoots = [ROOT_NODE_MODULES];
for (const parent of ["apps", "packages", "tooling"]) {
  const parentRoot = join(ROOT, parent);
  if (!existsSync(parentRoot)) continue;
  for (const workspace of readdirSync(parentRoot, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const packageRoot = join(parentRoot, workspace.name, "node_modules");
    if (existsSync(packageRoot)) packageRoots.push(packageRoot);
  }
}

const manifests = new Set();
for (const packageRoot of packageRoots) {
  for (const manifest of packageManifests(packageRoot)) manifests.add(manifest);
  const store = join(packageRoot, ".bun");
  if (!existsSync(store)) continue;
  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const manifest of packageManifests(join(store, entry.name, "node_modules"))) {
      manifests.add(manifest);
    }
  }
}

const nativeOnly = new Set();
for (const manifest of manifests) {
  if (!existsSync(manifest)) continue;
  const parsed = JSON.parse(readFileSync(manifest, "utf8"));
  if (!parsed || typeof parsed.name !== "string") {
    fail("Installed package has an invalid manifest: " + manifest);
  }
  const name = parsed.name;
  if (
    NATIVE_ONLY_NAMES.has(name) ||
    NATIVE_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix))
  ) {
    nativeOnly.add(name);
  }
}

if (nativeOnly.size > 0) {
  fail(
    "Web runtime dependency boundary contains native-only packages: " +
      [...nativeOnly].sort().join(", "),
  );
}
