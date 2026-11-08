import { lstatSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_BUN_VERSION = "1.4.4";
const GUIDANCE =
  "Deployment requires a verified regular root bun.lock; run bun run install:bootstrap using Bun 1.4.4 in fresh --no-install output before Vercel, Docker, Fly, or Cloudflare.";
const lockfilePath = resolve(process.cwd(), "bun.lock");

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  fail(
    "Deployment lock verification requires Bun " +
      EXPECTED_BUN_VERSION +
      "; received " +
      (typeof Bun === "undefined" ? "a non-Bun runtime" : "Bun " + Bun.version),
  );
}

let lockfile;
try {
  lockfile = lstatSync(lockfilePath);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    fail(GUIDANCE);
  }
  throw error;
}

if (!lockfile.isFile() || lockfile.isSymbolicLink()) fail(GUIDANCE);
