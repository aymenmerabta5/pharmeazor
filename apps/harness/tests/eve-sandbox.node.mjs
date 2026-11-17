import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scenario = process.argv[2];
assert.ok(["installed", "production", "hosted-selection"].includes(scenario));

const moduleUrl = new URL("../agent/sandbox/sandbox.ts", import.meta.url);
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

// Selecting a provider never provisions anything, so importing the sandbox
// module can neither reach a Docker daemon nor grow the dependency graph.
assert.equal(typeof sandbox, "function");
assert.equal(typeof environment.open, "function");
assert.equal(
  environment.provider,
  scenario === "hosted-selection" ? "vercel" : "docker",
  "sandbox provider selection",
);

// The agent runs in a container, never in the simulated shell, so the
// just-bash provider must not come back.
const source = await readFile(fileURLToPath(moduleUrl), "utf8");
assert.doesNotMatch(source, /just-bash/i, "the sandbox must not select the just-bash provider");

// Opening a sandbox belongs to the Eve runtime, which passes the constructor
// context; outside it the environment refuses instead of provisioning anything.
await assert.rejects(
  environment.open(),
  (error) => !/installing optional dependency/i.test(error.message),
);

assert.deepEqual(await dependencyHashes(), before);
process.stdout.write(
  JSON.stringify({
    ok: true,
    scenario,
    nodeVersion: process.versions.node,
    provider: environment.provider,
    dependencyHashesUnchanged: true,
  }) + "\n",
);
