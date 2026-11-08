import { spawnSync } from "node:child_process";

const EXPECTED_BUN_VERSION = "1.4.4";
const FRAMEWORK = "nextjs";
const HAS_HOSTED_EVE = true;
const EVE_PACKAGE_NAME = "pharmeazor-eve";

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  throw new Error(
    "Deployment builds require Bun " +
      EXPECTED_BUN_VERSION +
      "; received " +
      (typeof Bun === "undefined" ? "a non-Bun runtime" : "Bun " + Bun.version),
  );
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Next/withEve owns its service build on Vercel. Every other hosted Eve
// topology needs the standalone agent artifact before the web build starts.
if (HAS_HOSTED_EVE && (!process.env.VERCEL || FRAMEWORK === "tanstack-start")) {
  run(["x", "--no-install", "turbo", "run", "build", "--filter=" + EVE_PACKAGE_NAME]);
}

// Deploying the web host must never package sibling Expo/Electron clients.
// The trailing ellipsis includes the web package's complete dependency closure.
const filters = ["--filter=web..."];
if (HAS_HOSTED_EVE) filters.push("--filter=!" + EVE_PACKAGE_NAME);
run(["x", "--no-install", "turbo", "run", "build", ...filters]);
