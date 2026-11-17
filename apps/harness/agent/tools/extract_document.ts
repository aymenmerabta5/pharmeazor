import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  SANDBOX_DEFAULT_MAX_CHARACTERS,
  SANDBOX_DOCUMENT_PATH_VARIABLE,
  SANDBOX_DOCUMENT_READER_PATH,
  SANDBOX_MAX_CHARACTERS_LIMIT,
  SANDBOX_MAX_CHARACTERS_VARIABLE,
  SANDBOX_MAX_PAGES_LIMIT,
  SANDBOX_MAX_PAGES_VARIABLE,
  SANDBOX_PYTHON,
} from "../lib/sandbox-contract.ts";

/**
 * Reads a document that lives in the sandbox workspace.
 *
 * The document path travels through the environment instead of the command
 * line, so a path can never be read as shell syntax. The reader itself is
 * seeded into every sandbox workspace, and it reports the extracted content
 * as one JSON document on stdout.
 */
export default defineTool({
  description:
    "Read a PDF, Word, or spreadsheet document from the sandbox workspace and return its text. " +
    "Use it for specifications, protocols, batch records, and any other document the user attaches " +
    "or drops into the workspace. Scanned PDFs without a text layer cannot be read.",
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        "Path of the document inside the sandbox workspace, for example the path in an attachment label.",
      ),
    maxPages: z
      .number()
      .int()
      .min(1)
      .max(SANDBOX_MAX_PAGES_LIMIT)
      .optional()
      .describe("Maximum number of pages to read. Defaults to every page."),
    maxCharacters: z
      .number()
      .int()
      .min(1_000)
      .max(SANDBOX_MAX_CHARACTERS_LIMIT)
      .optional()
      .describe(
        `Maximum number of characters of extracted text to return. Defaults to ${SANDBOX_DEFAULT_MAX_CHARACTERS}.`,
      ),
  }),
  async execute({ path, maxPages, maxCharacters }, ctx) {
    const sandbox = await ctx.getSandbox();
    const result = await sandbox.run({
      command: `${SANDBOX_PYTHON} ${SANDBOX_DOCUMENT_READER_PATH}`,
      env: {
        [SANDBOX_DOCUMENT_PATH_VARIABLE]: path,
        [SANDBOX_MAX_CHARACTERS_VARIABLE]: String(maxCharacters ?? SANDBOX_DEFAULT_MAX_CHARACTERS),
        ...(maxPages ? { [SANDBOX_MAX_PAGES_VARIABLE]: String(maxPages) } : {}),
      },
    });
    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `The document reader failed with exit code ${result.exitCode}: ${result.stdout.trim()}`,
      );
    }

    let extracted: {
      readonly path: string;
      readonly kind: string;
      readonly pageCount: number | null;
      readonly extractedPages: number | null;
      readonly metadata: Readonly<Record<string, string>>;
      readonly characters: number;
      readonly truncated: boolean;
      readonly text: string;
      readonly warnings: readonly string[];
    };
    try {
      extracted = JSON.parse(result.stdout) as typeof extracted;
    } catch {
      throw new Error(`The document reader returned unreadable output: ${result.stdout.trim()}`);
    }

    return {
      path: extracted.path,
      kind: extracted.kind,
      pageCount: extracted.pageCount,
      extractedPages: extracted.extractedPages,
      metadata: extracted.metadata,
      characters: extracted.characters,
      truncated: extracted.truncated,
      warnings: extracted.warnings,
      text: extracted.text,
    };
  },
});
