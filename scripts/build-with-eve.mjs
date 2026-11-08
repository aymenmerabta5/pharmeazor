import { spawnSync } from "node:child_process";

const EXPECTED_BUN_VERSION = "1.4.4";
const MODE = "monorepo";
const FRAMEWORK = "nextjs";
const EVE_PACKAGE_NAME = "pharmeazor-eve";

if (typeof Bun === "undefined" || Bun.version !== EXPECTED_BUN_VERSION) {
  throw new Error(
    "The Eve-aware build requires Bun " +
      EXPECTED_BUN_VERSION +
      "; received " +
      (typeof Bun === "undefined" ? "a non-Bun runtime" : Bun.version),
  );
}

function run(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...extraEnv },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error("Command failed with exit code " + String(result.status ?? 1));
}

const isVercel = Boolean(process.env.VERCEL);
if (MODE === "monorepo") {
  // Outside Vercel, withEve starts the previously built .output server, so
  // finish Eve before Next begins its production build. On Vercel, withEve
  // owns the generated service build and a standalone Eve build is redundant.
  if (!isVercel || FRAMEWORK === "tanstack-start") {
    run(["x", "--no-install", "turbo", "run", "build", "--filter=" + EVE_PACKAGE_NAME]);
  }
  run(["x", "--no-install", "turbo", "run", "build", "--filter=!" + EVE_PACKAGE_NAME]);
} else {
  if (FRAMEWORK === "tanstack-start") {
    run(["run", "eve:build"]);
  } else if (!isVercel) {
    run(["run", "eve:build"]);
  }
  run(["run", "build:web"]);
}
