# Agent sandbox

The agent runs its shell and file tools inside a container that carries a
Python runtime, because its work is reading and analysing regulated documents
rather than running application code.

## Runtime contract

Every provider exposes the same contract, so a tool behaves identically on a
developer machine, in CI, and in production:

| Contract                               | Provided by                                                         |
| -------------------------------------- | ------------------------------------------------------------------- |
| `python3` on `PATH`                    | The image (`Dockerfile`) and the hosted virtual environment.        |
| The pinned distributions importable    | `workspace/requirements.txt`, installed during sandbox preparation. |
| `extract_document.py` in the workspace | The workspace seed, so every session can read a document.           |

The shared constants live in `agent/lib/sandbox-contract.ts`. The sandbox
module and the tools import them, so the contract has one definition.

## Layout

```text
agent/sandbox/
├── Dockerfile                       # the sandbox image
├── README.md                        # this file
├── sandbox.ts                       # the environment and the session selector
└── workspace/                       # seeded into every sandbox workspace
    ├── requirements.txt             # the pinned Python distributions
    └── extract_document.py          # the sandbox-side document reader
```

`workspace/` is eve's workspace seed: eve copies these files into every new
session sandbox, which is why the same requirements file installs the
libraries in the image and on the hosted provider.

## Choosing the Python packages

The image carries only what document work needs. There is no numerical,
scientific, cheminformatics, or machine-learning stack, and no Node.js and no
package manager, so a session cannot grow the application's dependency graph.

| Distribution   | Reads                         |
| -------------- | ----------------------------- |
| `pypdf`        | PDF text and metadata         |
| `pdfminer.six` | PDF text pypdf cannot recover |
| `python-docx`  | Word documents                |
| `openpyxl`     | Spreadsheets                  |

Every distribution, including the transitive ones, is pinned so a rebuilt
image contains exactly the reviewed set of packages. To change the set, edit
`workspace/requirements.txt`, rebuild the image, and re-run the sandbox tests.

## Using the runtime

The `extract_document` tool in `agent/tools/extract_document.ts` calls the
seeded reader. The tool passes every value through the environment, so a
document path is never read as shell syntax:

| Variable                    | Meaning                                    |
| --------------------------- | ------------------------------------------ |
| `PHARMEAZOR_DOCUMENT_PATH`  | The document to read.                      |
| `PHARMEAZOR_MAX_PAGES`      | The page budget; unset reads every page.   |
| `PHARMEAZOR_MAX_CHARACTERS` | The character budget of the returned text. |

The reader prints one JSON object on stdout and keeps its diagnostics on
stderr. A document with no text layer, such as a scan, is reported as a
warning: the sandbox has no OCR engine.

## Providers

| Target                     | Provider       | Runtime                                       |
| -------------------------- | -------------- | --------------------------------------------- |
| Self-hosted, CI, developer | Docker         | The image built from `Dockerfile`.            |
| Vercel                     | Vercel Sandbox | A virtual environment prepared at build time. |

The provider follows the deployment target, not the host that runs the build:
Vercel build containers and Vercel functions both set `VERCEL`, and every other
target runs the agent beside a Docker daemon. The prepared template records the
choice, so a session always resumes on the provider that created it.

A Docker sandbox needs a reachable Linux Docker daemon when `eve build`
prepares the template and when a session opens its container. See
`docs/EVE_SELF_HOSTING.md` for the deployment contract.
