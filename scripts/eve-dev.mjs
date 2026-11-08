import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (typeof Bun !== "undefined") throw new Error("Eve's development worker requires Node.js");
const appRoot = fileURLToPath(new URL("../apps/eve/", import.meta.url));
const require = createRequire(pathToFileURL(join(appRoot, "package.json")));
const cli = join(dirname(require.resolve("eve/package.json")), "bin", "eve.js");
const port = process.env.EVE_NEXT_PRODUCTION_PORT?.trim() || "4274";
if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
  throw new Error("EVE_NEXT_PRODUCTION_PORT must be an integer between 1 and 65535");
}
const result = spawnSync(
  process.execPath,
  [cli, "dev", "--no-ui", "--host", "127.0.0.1", "--port", port],
  {
    cwd: appRoot,
    env: { ...process.env, NODE_ENV: "development", GHOSTINIT_EVE_RUNTIME: "1" },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
