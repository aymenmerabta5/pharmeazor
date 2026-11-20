import { describe, expect, it } from "bun:test";
import { retrieval } from "@repo/services";

const { lexicalDocumentLength, queryTerms, termFrequencies, tokenizeForLexical } = retrieval;

describe("lexical tokenizer", () => {
  it("folds diacritics so accented and unaccented spellings match", () => {
    expect(tokenizeForLexical("Paracétamol")).toEqual(["paracetamol"]);
    expect(tokenizeForLexical("paracetamol")).toEqual(["paracetamol"]);
    expect(tokenizeForLexical("GROSSESSE et allaitement")).toEqual([
      "grossesse",
      "et",
      "allaitement",
    ]);
  });

  it("keeps digits, strengths, and identifiers", () => {
    expect(tokenizeForLexical("500 mg, 2 fois par jour, lot AB1234")).toEqual([
      "500",
      "mg",
      "2",
      "fois",
      "par",
      "jour",
      "lot",
      "ab1234",
    ]);
  });

  it("keeps Arabic letters intact", () => {
    expect(tokenizeForLexical("الجرعة اليومية")).toEqual(["الجرعة", "اليومية"]);
  });

  it("drops single characters and punctuation-only input", () => {
    expect(tokenizeForLexical("a b c 12")).toEqual(["12"]);
    expect(tokenizeForLexical("— · / ( )")).toEqual([]);
  });

  it("deduplicates query terms while preserving order", () => {
    expect(queryTerms("dose dose maximum MAXIMUM")).toEqual(["dose", "maximum"]);
    expect(queryTerms("one two three four", 2)).toEqual(["one", "two"]);
  });

  it("counts repetitions for BM25 term frequency and length", () => {
    const tokens = tokenizeForLexical("dose dose mg");
    expect(termFrequencies(tokens)).toEqual(
      new Map([
        ["dose", 2],
        ["mg", 1],
      ]),
    );
    expect(lexicalDocumentLength(tokens)).toBe(3);
  });
});
