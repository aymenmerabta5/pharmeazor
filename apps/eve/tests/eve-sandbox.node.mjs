import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scenario = process.argv[2];
assert.ok(["installed", "production", "missing", "hosted-selection"].includes(scenario));
let installAttempts = 0;
const originalInfo = console.info;
console.info = (...values) => {
  if (values.some((value) => String(value).includes("installing optional dependency")))
    installAttempts += 1;
};
if (scenario === "missing") {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "just-bash" || specifier.startsWith("just-bash/")) {
        const error = new Error(
          "Dependency deliberately unavailable for this isolated negative probe",
        );
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      }
      return nextResolve(specifier, context);
    },
  });
  process.env.PATH =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:/Windows", "System32")
      : "/__ghostinit_no_package_manager__";
}
const moduleUrl = new URL("../agent/sandbox.ts", import.meta.url);
const { default: sandbox, environment } = await import(moduleUrl);
async function dependencyHashes() {
  const hashes = {};
  let directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (;;) {
    for (const name of ["package.json", "bun.lock"]) {
      const path = join(directory, name);
      if (existsSync(path))
        hashes[path] = createHash("sha256")
          .update(await readFile(path))
          .digest("hex");
    }
    if (existsSync(join(directory, "bun.lock"))) return hashes;
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Run install:bootstrap before sandbox tests");
    directory = parent;
  }
}
const before = await dependencyHashes();

// Selecting a provider never loads its engine, so an unavailable or uninstalled
// backend cannot reach a package manager during import.
assert.equal(typeof sandbox, "function");
assert.equal(typeof environment.open, "function");
assert.equal(
  environment.provider,
  scenario === "hosted-selection" ? "vercel" : "just-bash",
  "sandbox provider selection",
);
assert.equal(installAttempts, 0, "sandbox import installed a dependency");

// The local backend must opt out of Eve's automatic package installation, and a
// production runtime must never grow dependencies at run time.
const source = await readFile(fileURLToPath(moduleUrl), "utf8");
assert.match(
  source,
  /JustBashSandbox\.environment\(\{\s*autoInstall:\s*false\s*\}\)/,
  "just-bash environment must disable autoInstall",
);

// Opening a sandbox belongs to the Eve runtime, which passes the constructor
// context; outside it the environment refuses instead of provisioning anything.
await assert.rejects(
  environment.open(),
  (error) => !/installing optional dependency/i.test(error.message),
);
if (scenario === "hosted-selection") {
  // The bundled hosted backend is reachable without creating a billable sandbox.
  assert.equal(typeof environment.open, "function");
}
assert.equal(installAttempts, 0);
assert.deepEqual(await dependencyHashes(), before);
console.info = originalInfo;
process.stdout.write(
  JSON.stringify({
    ok: true,
    scenario,
    nodeVersion: process.versions.node,
    dependencyHashesUnchanged: true,
  }) + "\n",
);
