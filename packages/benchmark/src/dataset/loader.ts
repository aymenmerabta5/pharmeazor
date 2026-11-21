import { QuestionSchema, type Question } from "./schema";

/**
 * Errors raised while loading a benchmark dataset.
 * The message includes file path and line number when available.
 */
export class DatasetError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly path?: string,
  ) {
    super(line !== undefined ? `${path ?? "<inline>"}:${line}: ${message}` : message);
    this.name = "DatasetError";
  }
}

/**
 * Load the model-facing questions file. This is the ONLY loader the raw
 * benchmark runner is allowed to use. Gold annotations have their own
 * loader in `gold-loader.ts`, which is NOT re-exported from the package
 * barrel and NOT imported here.
 */
export async function loadQuestionsFromFile(path: string): Promise<Question[]> {
  const text = await Bun.file(path).text();
  return parseQuestionsJsonl(text, path);
}

export function parseQuestionsJsonl(text: string, path = "<inline>"): Question[] {
  const out: Question[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new DatasetError(`invalid JSON: ${(err as Error).message}`, i + 1, path);
    }
    const result = QuestionSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((iss) => `${iss.path.join(".") || "<root>"}: ${iss.message}`)
        .join("; ");
      throw new DatasetError(`schema validation failed: ${issues}`, i + 1, path);
    }
    out.push(result.data);
  }
  return out;
}

/** Only APPROVED questions are eligible for a scored benchmark run. */
export function filterApprovedForScoredRun(questions: readonly Question[]): Question[] {
  return questions.filter((q) => q.review_status === "APPROVED");
}
