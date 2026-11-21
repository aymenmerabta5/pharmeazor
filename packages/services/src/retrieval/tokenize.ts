/**
 * Lexical analyzer for the BM25 arm.
 *
 * The analyser is intentionally shared by indexing and querying: a term that
 * is stored must be findable with the same tokenizer. It folds diacritics so
 * `paracétamol` and `paracetamol` match, keeps digits (strengths and register
 * codes matter in this corpus), and uses Unicode letter/number classes so
 * Arabic and French text survive unchanged.
 *
 * Bump `LEXICAL_TOKENIZER_VERSION` whenever this file changes. Existing
 * postings are then stale and the indexer must re-tokenize them.
 */

export const LEXICAL_TOKENIZER_VERSION = "lexical-fold-v1";

const MIN_TERM_LENGTH = 2;
const MAX_TERM_LENGTH = 48;
const TERM_PATTERN = /[\p{L}\p{N}]+/gu;

export function tokenizeForLexical(input: string): string[] {
  const folded = input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  const terms: string[] = [];
  for (const match of folded.matchAll(TERM_PATTERN)) {
    const term = match[0];
    if (term.length > MAX_TERM_LENGTH) continue;
    // A single digit carries meaning (`2 fois par jour`), a single letter does not.
    if (term.length < MIN_TERM_LENGTH && !/^\p{N}+$/u.test(term)) continue;
    terms.push(term);
  }
  return terms;
}

/** Deduplicate query terms while preserving the caller's order. */
export function queryTerms(input: string, maximum = 32): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of tokenizeForLexical(input)) {
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= maximum) break;
  }
  return terms;
}

export function termFrequencies(tokens: readonly string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }
  return frequencies;
}

/** BM25 document length is the number of indexed terms, with repetitions. */
export function lexicalDocumentLength(tokens: readonly string[]): number {
  return tokens.length;
}
