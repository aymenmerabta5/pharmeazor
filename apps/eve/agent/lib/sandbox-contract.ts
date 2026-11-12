/**
 * The runtime contract the agent's sandbox exposes to every provider.
 *
 * The agent reads and analyses regulated documents, so it runs in a real
 * container with a Python runtime instead of a simulated shell. The sandbox
 * module in `agent/sandbox/sandbox.ts` provisions that runtime, and the tools
 * in `agent/tools/` call into it. Both sides share the constants below so the
 * contract has exactly one definition.
 */

/** The interpreter every provider exposes on `PATH`. */
export const SANDBOX_PYTHON = "python3";

/** The workspace path of the pinned Python requirements. */
export const SANDBOX_REQUIREMENTS_PATH = "requirements.txt";

/** The workspace path of the sandbox-side document reader. */
export const SANDBOX_DOCUMENT_READER_PATH = "extract_document.py";

/** One distribution the sandbox runtime provides and the module it imports. */
export interface SandboxPythonDistribution {
  /** The name pip installs. */
  readonly distribution: string;
  /** The name Python imports, which differs for `python-docx` and `pdfminer.six`. */
  readonly module: string;
}

/**
 * The Python distributions the sandbox runtime must provide.
 *
 * `pypdf` and `pdfminer` read PDFs, `docx` reads Word documents, and
 * `openpyxl` reads spreadsheets. Every distribution is pinned in
 * `agent/sandbox/workspace/requirements.txt`.
 */
export const SANDBOX_PYTHON_DISTRIBUTIONS: readonly SandboxPythonDistribution[] = [
  { distribution: "pypdf", module: "pypdf" },
  { distribution: "pdfminer.six", module: "pdfminer" },
  { distribution: "python-docx", module: "docx" },
  { distribution: "openpyxl", module: "openpyxl" },
];

/** The environment variable that carries the document path into the reader. */
export const SANDBOX_DOCUMENT_PATH_VARIABLE = "PHARMEAZOR_DOCUMENT_PATH";

/** The environment variable that caps the number of pages the reader reads. */
export const SANDBOX_MAX_PAGES_VARIABLE = "PHARMEAZOR_MAX_PAGES";

/** The environment variable that caps the number of characters the reader returns. */
export const SANDBOX_MAX_CHARACTERS_VARIABLE = "PHARMEAZOR_MAX_CHARACTERS";

/** The character budget of one extraction when the caller does not set one. */
export const SANDBOX_DEFAULT_MAX_CHARACTERS = 50_000;

/** The largest character budget one extraction may request. */
export const SANDBOX_MAX_CHARACTERS_LIMIT = 200_000;

/** The largest page count one extraction may request. */
export const SANDBOX_MAX_PAGES_LIMIT = 2_000;
