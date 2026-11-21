import { describe, it, expect } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as barrel from "../../src/index";

const PKG_ROOT = join(import.meta.dir, "..", "..");

describe("gold-annotation isolation", () => {
  it("the package barrel does not export loadGoldAnnotationsFromFile", () => {
    expect("loadGoldAnnotationsFromFile" in barrel).toBe(false);
  });

  it("the package barrel does not export parseGoldAnnotationsJsonl", () => {
    expect("parseGoldAnnotationsJsonl" in barrel).toBe(false);
  });

  it("src/dataset/loader.ts does not import gold-loader", async () => {
    const src = await readFile(join(PKG_ROOT, "src/dataset/loader.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*gold-loader/);
  });

  it("src/dataset/loader.ts does not export any gold-related symbol", async () => {
    const src = await readFile(join(PKG_ROOT, "src/dataset/loader.ts"), "utf8");
    expect(src).not.toMatch(/export\s+(async\s+)?function\s+loadGold/);
    expect(src).not.toMatch(/export\s+const\s+.*GoldAnnotation/);
    expect(src).not.toMatch(/export\s+type\s+.*GoldAnnotation/);
  });

  it("QuestionSchema rejects a question that carries reference_answer", async () => {
    const { QuestionSchema } = await import("../../src/dataset/schema");
    const withLeak = {
      question_id: "Q-ISO-001",
      language: "fr",
      category: "GENERAL_MEDICATION_KNOWLEDGE",
      therapeutic_class: "Test",
      question: "Question ?",
      expected_raw_behavior: "ANSWER",
      review_status: "DRAFT",
      reference_answer: "not allowed",
    };
    expect(QuestionSchema.safeParse(withLeak).success).toBe(false);
  });
});
