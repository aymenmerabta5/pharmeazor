import { defineSandbox, type SandboxSession } from "eve/sandbox";
import { DockerSandbox } from "eve/sandbox/docker";
import { VercelSandbox } from "eve/sandbox/vercel";

import {
  SANDBOX_PYTHON,
  SANDBOX_PYTHON_DISTRIBUTIONS,
  SANDBOX_REQUIREMENTS_PATH,
} from "../lib/sandbox-contract.ts";

/**
 * The sandbox of the pharmeazor agent.
 *
 * The agent reads and analyses regulated documents, so it needs a real Python
 * runtime rather than a simulated shell. Every provider therefore exposes the
 * same contract:
 *
 * - `python3` on `PATH` imports the distributions pinned in
 *   `workspace/requirements.txt`.
 * - The workspace is seeded with those requirements and with the sandbox-side
 *   document reader the `extract_document` tool calls.
 *
 * The Docker provider bakes both into the image built from `Dockerfile`. The
 * hosted provider installs them while it prepares the template snapshot.
 *
 * The provider is selected by the deployment target, not by the host that
 * happens to run the build. Vercel build containers and Vercel functions both
 * set `VERCEL`, and every other target runs the agent beside a Docker daemon.
 * The prepared template records the choice, so a session always resumes on the
 * provider that created it.
 */

/** The virtual environment the hosted provider installs the pinned packages in. */
const HOSTED_VIRTUAL_ENVIRONMENT = "/opt/pharmeazor/venv";

/** The profile fragment that puts the hosted virtual environment on `PATH`. */
const HOSTED_PROFILE_PATH = "/etc/profile.d/pharmeazor-python.sh";

/** The path of the script that reports the installed distributions. */
const RUNTIME_PROBE_PATH = "/tmp/pharmeazor-probe-python-runtime.py";

/**
 * Reports the Python modules the sandbox runtime provides.
 *
 * The script writes its result as JSON on stdout and never fails: an
 * unreadable module is reported as `false` instead of raising.
 */
const RUNTIME_PROBE_SOURCE = [
  "import importlib",
  "import json",
  "import os",
  "import sys",
  "",
  "modules = json.loads(os.environ['PHARMEAZOR_PYTHON_MODULES'])",
  "available = {}",
  "for name in modules:",
  "    try:",
  "        importlib.import_module(name)",
  "        available[name] = True",
  "    except Exception:",
  "        available[name] = False",
  "sys.stdout.write(json.dumps(available))",
].join("\n");

/**
 * Fails the sandbox preparation when the runtime does not satisfy the
 * contract.
 *
 * A provider that silently starts without the pinned libraries would move the
 * failure into a later turn, where the agent cannot tell a missing library
 * from a broken document.
 */
async function verifyPythonRuntime(sandbox: SandboxSession): Promise<void> {
  await sandbox.writeTextFile({ path: RUNTIME_PROBE_PATH, content: RUNTIME_PROBE_SOURCE });
  const result = await sandbox.run({
    command: `${SANDBOX_PYTHON} ${RUNTIME_PROBE_PATH}`,
    env: {
      PHARMEAZOR_PYTHON_MODULES: JSON.stringify(
        SANDBOX_PYTHON_DISTRIBUTIONS.map((entry) => entry.module),
      ),
    },
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `The sandbox could not report its Python runtime: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  let available: Record<string, boolean>;
  try {
    available = JSON.parse(result.stdout) as Record<string, boolean>;
  } catch {
    throw new Error(`The sandbox reported an unreadable Python runtime: ${result.stdout.trim()}`);
  }
  const missing = SANDBOX_PYTHON_DISTRIBUTIONS.filter((entry) => available[entry.module] !== true);
  if (missing.length > 0) {
    throw new Error(
      `The sandbox Python runtime is missing ${missing.map((entry) => entry.module).join(", ")}. ` +
        "Rebuild the sandbox environment from agent/sandbox/Dockerfile.",
    );
  }
}

/**
 * Runs a sandbox command and turns a failure into an error.
 *
 * `run()` reports a non-zero exit code instead of throwing, so a setup step
 * that fails would otherwise be reported as a successful preparation.
 */
async function runOrThrow(sandbox: SandboxSession, command: string): Promise<void> {
  const result = await sandbox.run({ command });
  if (result.exitCode !== 0) {
    const output = result.stderr.trim() || result.stdout.trim();
    throw new Error(`The sandbox command "${command}" failed: ${output}`);
  }
}

/**
 * Prepares the hosted sandbox runtime.
 *
 * The hosted base image ships Python without `pip`, and its system Python
 * refuses to install packages, so the pinned distributions go into a virtual
 * environment. A profile fragment puts that environment on `PATH` for every
 * login shell, which is how eve runs commands.
 */
async function prepareHostedPythonRuntime(sandbox: SandboxSession): Promise<void> {
  await runOrThrow(sandbox, "sudo apt-get update");
  await runOrThrow(sandbox, "sudo apt-get install --yes python3-venv");
  await runOrThrow(sandbox, `sudo ${SANDBOX_PYTHON} -m venv ${HOSTED_VIRTUAL_ENVIRONMENT}`);
  await runOrThrow(
    sandbox,
    `sudo ${HOSTED_VIRTUAL_ENVIRONMENT}/bin/pip install --no-cache-dir --requirement ${SANDBOX_REQUIREMENTS_PATH}`,
  );
  await runOrThrow(
    sandbox,
    `printf '%s\\n' 'export PATH=${HOSTED_VIRTUAL_ENVIRONMENT}/bin:$PATH' | sudo tee ${HOSTED_PROFILE_PATH} > /dev/null`,
  );
  await verifyPythonRuntime(sandbox);
}

/**
 * The environment the agent runs in.
 *
 * The Docker environment uses the image built from `agent/sandbox/Dockerfile`.
 * The hosted environment starts from the provider's base image and installs
 * the same pinned runtime while it prepares the template.
 */
export const environment = process.env.VERCEL?.trim()
  ? VercelSandbox.environment({ prepare: prepareHostedPythonRuntime })
  : DockerSandbox.dockerfile({ prepare: verifyPythonRuntime });

export default defineSandbox(() => environment.open());
