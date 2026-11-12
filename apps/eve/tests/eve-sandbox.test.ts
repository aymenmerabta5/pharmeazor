import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

for (const scenario of ["installed", "production", "hosted-selection"]) {
  test(
    "Eve sandbox dependency policy: " + scenario,
    () => {
      const allowed = new Set([
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "SYSTEMDRIVE",
        "HOME",
        "USERPROFILE",
        "TEMP",
        "TMP",
        "TMPDIR",
      ]);
      const environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => allowed.has(key.toUpperCase())),
      );
      const output = execFileSync(
        "node",
        [fileURLToPath(new URL("./eve-sandbox.node.mjs", import.meta.url)), scenario],
        {
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
          env: {
            ...environment,
            NODE_ENV:
              scenario === "production" || scenario === "hosted-selection"
                ? "production"
                : "development",
            EVE_DEV: scenario === "production" || scenario === "hosted-selection" ? "0" : "1",
            ...(scenario === "hosted-selection" ? { VERCEL: "1" } : {}),
          },
        },
      );
      expect(JSON.parse(output)).toMatchObject({
        ok: true,
        scenario,
        provider: scenario === "hosted-selection" ? "vercel" : "docker",
        dependencyHashesUnchanged: true,
      });
    },
    35_000,
  );
}
