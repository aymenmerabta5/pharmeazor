import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
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
const { default: sandbox } = await import("../agent/sandbox.ts");
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
const fixture = await mkdtemp(join(tmpdir(), "ghostinit-eve-sandbox-"));
const target = resolve(fixture);
if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("ghostinit-eve-sandbox-"))
  throw new Error("Unsafe sandbox fixture cleanup");
try {
  const backend = sandbox.backend;
  assert.equal(backend?.name, scenario === "hosted-selection" ? "vercel" : "just-bash");
  const templateKey = "ghostinit-proof-" + randomUUID();
  const runtimeContext = { appRoot: fixture };
  const input = {
    templateKey,
    runtimeContext,
    seedFiles: [{ path: "/workspace/proof.txt", content: "sandbox-ready" }],
  };
  if (scenario === "hosted-selection") {
    // Resolve the bundled hosted backend without provisioning a billable sandbox.
    assert.equal(typeof backend.create, "function");
    assert.equal(typeof backend.prewarm, "function");
  } else if (scenario === "missing") {
    await assert.rejects(
      backend.prewarm(input),
      (error) => /just-bash/.test(error.message) && !/Automatic installation/.test(error.message),
    );
  } else {
    await backend.prewarm(input);
    const handle = await backend.create({
      templateKey,
      sessionKey: "proof-" + randomUUID(),
      runtimeContext,
    });
    try {
      const result = await handle.session.run({ command: "cat /workspace/proof.txt" });
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout, "sandbox-ready");
    } finally {
      await handle.shutdown();
    }
  }
  assert.equal(installAttempts, 0);
  assert.deepEqual(await dependencyHashes(), before);
  process.stdout.write(
    JSON.stringify({
      ok: true,
      scenario,
      nodeVersion: process.versions.node,
      dependencyHashesUnchanged: true,
    }) + "\n",
  );
} finally {
  console.info = originalInfo;
  await rm(target, { recursive: true, force: true });
}
