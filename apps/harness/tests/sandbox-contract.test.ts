import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  SANDBOX_DOCUMENT_PATH_VARIABLE,
  SANDBOX_DOCUMENT_READER_PATH,
  SANDBOX_MAX_CHARACTERS_VARIABLE,
  SANDBOX_MAX_PAGES_VARIABLE,
  SANDBOX_PYTHON,
  SANDBOX_PYTHON_DISTRIBUTIONS,
  SANDBOX_REQUIREMENTS_PATH,
} from "../agent/lib/sandbox-contract.ts";

const sandboxRoot = new URL("../agent/sandbox/", import.meta.url);
const workspaceRoot = new URL("../agent/sandbox/workspace/", import.meta.url);

async function readWorkspaceFile(name: string): Promise<string> {
  return await readFile(new URL(name, workspaceRoot), "utf8");
}

function parseRequirements(source: string): Map<string, string> {
  const pins = new Map<string, string>();
  for (const line of source.split("\n")) {
    const entry = line.trim();
    if (entry.length === 0 || entry.startsWith("#")) continue;
    const separator = entry.indexOf("==");
    expect(separator, `the requirement "${entry}" must pin an exact version`).toBeGreaterThan(0);
    pins.set(entry.slice(0, separator), entry.slice(separator + 2));
  }
  return pins;
}

describe("Eve sandbox contract", () => {
  test("the workspace seeds the pinned requirements and the document reader", async () => {
    expect(existsSync(fileURLToPath(new URL(SANDBOX_REQUIREMENTS_PATH, workspaceRoot)))).toBe(true);
    expect(existsSync(fileURLToPath(new URL(SANDBOX_DOCUMENT_READER_PATH, workspaceRoot)))).toBe(
      true,
    );
  });

  test("every distribution the runtime needs is pinned", async () => {
    const pins = parseRequirements(await readWorkspaceFile(SANDBOX_REQUIREMENTS_PATH));
    for (const entry of SANDBOX_PYTHON_DISTRIBUTIONS) {
      expect(pins.get(entry.distribution), `${entry.distribution} must be pinned`).toBeDefined();
    }
    expect(pins.size).toBeGreaterThanOrEqual(SANDBOX_PYTHON_DISTRIBUTIONS.length);
  });

  test("the image installs the seeded requirements and stays a Python runtime", async () => {
    const dockerfile = await readFile(new URL("Dockerfile", sandboxRoot), "utf8");
    expect(dockerfile).toContain(`COPY workspace/${SANDBOX_REQUIREMENTS_PATH}`);
    expect(dockerfile).toMatch(/^FROM python:\d+\.\d+-slim/m);
    expect(dockerfile).not.toMatch(/nodejs|npm install|yarn|pnpm/i);
  });

  test("the document reader reads the environment the tool sets", async () => {
    const reader = await readWorkspaceFile(SANDBOX_DOCUMENT_READER_PATH);
    for (const variable of [
      SANDBOX_DOCUMENT_PATH_VARIABLE,
      SANDBOX_MAX_PAGES_VARIABLE,
      SANDBOX_MAX_CHARACTERS_VARIABLE,
    ]) {
      expect(reader, `the reader must read ${variable}`).toContain(variable);
    }
    expect(reader).toContain("json.dumps");
  });

  test("the document reader is valid Python", () => {
    const interpreter = ["python3", "python"].find((candidate) => {
      const probe = spawnSync(candidate, ["--version"], { encoding: "utf8", windowsHide: true });
      return probe.status === 0;
    });
    if (interpreter === undefined) return;
    const script = fileURLToPath(new URL(SANDBOX_DOCUMENT_READER_PATH, workspaceRoot));
    const compiled = spawnSync(
      interpreter,
      [
        "-c",
        "import sys;source=open(sys.argv[1],encoding='utf-8').read();compile(source,sys.argv[1],'exec')",
        script,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    expect(compiled.stderr).toBe("");
    expect(compiled.status).toBe(0);
  });

  test("the runtime contract names one interpreter", () => {
    expect(SANDBOX_PYTHON).toBe("python3");
  });
});
