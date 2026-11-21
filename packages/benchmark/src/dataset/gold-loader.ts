import { DatasetError } from "./loader";
import { GoldAnnotationSchema, type GoldAnnotation } from "./schema";

/**
 * Gold-annotation loader. Deliberately a separate module:
 *  - not imported by `src/dataset/loader.ts`
 *  - not re-exported from `src/index.ts`
 *  - only reachable through the validation path and the future review UI
 */
export async function loadGoldAnnotationsFromFile(path: string): Promise<GoldAnnotation[]> {
  const text = await Bun.file(path).text();
  return parseGoldAnnotationsJsonl(text, path);
}

export function parseGoldAnnotationsJsonl(text: string, path = "<inline>"): GoldAnnotation[] {
  const out: GoldAnnotation[] = [];
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
    const result = GoldAnnotationSchema.safeParse(parsed);
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
