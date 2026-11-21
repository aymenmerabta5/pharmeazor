import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import {
  DatasetError,
  filterApprovedForScoredRun,
  loadQuestionsFromFile,
  parseQuestionsJsonl,
} from "../../src/dataset/loader";

const PKG_ROOT = join(import.meta.dir, "..", "..");

const VALID_LINE = JSON.stringify({
  question_id: "Q-TEST-001",
  language: "fr",
  category: "GENERAL_MEDICATION_KNOWLEDGE",
  therapeutic_class: "Test",
  question: "Question ?",
  expected_raw_behavior: "ANSWER",
  review_status: "DRAFT",
});

describe("parseQuestionsJsonl", () => {
  it("parses a single valid line", () => {
    const qs = parseQuestionsJsonl(VALID_LINE);
    expect(qs).toHaveLength(1);
    expect(qs[0]?.question_id).toBe("Q-TEST-001");
  });

  it("skips blank lines and comments", () => {
    const text = `\n# a comment\n${VALID_LINE}\n\n`;
    expect(parseQuestionsJsonl(text)).toHaveLength(1);
  });

  it("throws DatasetError with line number on invalid JSON", () => {
    let caught: unknown;
    try {
      parseQuestionsJsonl(`${VALID_LINE}\n{ not json }`);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DatasetError);
    expect((caught as DatasetError).line).toBe(2);
  });

  it("throws DatasetError on schema failure", () => {
    const bad = { ...JSON.parse(VALID_LINE), language: "de" };
    expect(() => parseQuestionsJsonl(JSON.stringify(bad))).toThrow(DatasetError);
  });

  it("rejects a question that carries reference_answer", () => {
    const leaky = { ...JSON.parse(VALID_LINE), reference_answer: "leak" };
    expect(() => parseQuestionsJsonl(JSON.stringify(leaky))).toThrow(DatasetError);
  });
});

describe("loadQuestionsFromFile (real dataset)", () => {
  const path = join(PKG_ROOT, "data/v1/questions.jsonl");

  it("loads the shipped dataset", async () => {
    const qs = await loadQuestionsFromFile(path);
    expect(qs.length).toBe(30);
  });

  it("every loaded question is DRAFT initially", async () => {
    const qs = await loadQuestionsFromFile(path);
    expect(qs.every((q) => q.review_status === "DRAFT")).toBe(true);
  });

  it("filterApprovedForScoredRun returns empty on the shipped dataset", async () => {
    const qs = await loadQuestionsFromFile(path);
    expect(filterApprovedForScoredRun(qs)).toHaveLength(0);
  });

  it("loaded questions do not contain reference_answer", async () => {
    const qs = await loadQuestionsFromFile(path);
    for (const q of qs) {
      expect(Object.prototype.hasOwnProperty.call(q, "reference_answer")).toBe(false);
    }
  });
});
