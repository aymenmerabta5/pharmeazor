import type { AliasMatch } from "./ports";

/**
 * Brand-to-substance query expansion.
 *
 * Measured on the indexed corpus: 775 of 2,144 known Algerian brand names
 * (36.1%) never occur anywhere in the text, so a brand-only question reaches
 * neither the dense nor the lexical arm. The alias table maps a brand to the
 * substance its documents are written with, and this module appends those
 * substance terms to the lexical query.
 *
 * Two rules come from the retrieval literature and are not negotiable here:
 *
 * - Expansion appends, never replaces. Replacing the brand would discard the
 *   one term that identifies the product and hand all of its IDF weight to a
 *   generic substance name.
 * - The added budget is small (four tokens). Long expansions reliably raise
 *   recall and unreliably lower precision; the cross-encoder reranker is what
 *   recovers the precision that expansion costs, and it can only do that if
 *   the expanded query stays close to the question.
 *
 * Ambiguous brands are never expanded. `COPARAMOL` exists as paracetamol alone
 * and as paracetamol with codeine; silently choosing one sense is how a
 * combination product gets dosed as a single agent. They are returned to the
 * agent as a disambiguation prompt instead.
 */

/** Longest brand alias, in tokens, that is matched inside a query. */
export const MAX_ALIAS_TOKENS = 4;
/** Most substance tokens appended to one query. */
export const MAX_EXPANDED_TERMS = 4;
/** Most ambiguous brands reported for one query. */
export const MAX_AMBIGUOUS_ALIASES = 5;
/** Hard ceiling on alias keys sent to the lookup port. */
const MAX_ALIAS_KEYS = 512;

/**
 * Every contiguous token span up to `MAX_ALIAS_TOKENS`, which is what a
 * multi-word brand (`COPARAMOL FORT`) needs in order to be found at all.
 */
export function aliasCandidateKeys(terms: readonly string[]): string[] {
  const keys = new Set<string>();
  for (let size = 1; size <= MAX_ALIAS_TOKENS; size += 1) {
    for (let start = 0; start + size <= terms.length; start += 1) {
      keys.add(terms.slice(start, start + size).join(" "));
      if (keys.size >= MAX_ALIAS_KEYS) return [...keys];
    }
  }
  return [...keys];
}

export interface QueryExpansion {
  /** Lexical terms to search with: the originals followed by the expansion. */
  readonly terms: readonly string[];
  /** Substance tokens actually appended; empty when nothing matched. */
  readonly expandedTerms: readonly string[];
  /** Brands that cover more than one substance and were not expanded. */
  readonly ambiguousAliases: readonly string[];
}

function tokenCount(aliasNorm: string): number {
  return aliasNorm.split(" ").filter(Boolean).length;
}

/** True when `needle` appears as a contiguous run inside `haystack`. */
function isContiguousRun(needle: readonly string[], haystack: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function expandQueryTerms(
  terms: readonly string[],
  matches: readonly AliasMatch[],
): QueryExpansion {
  const original = new Set(terms);
  const appended: string[] = [];
  const ambiguousAliases: string[] = [];
  const claimed: string[][] = [];

  // Longest alias first: when both `APAP` and `APAP IBUPROFENE BEKER` match,
  // the specific product wins and the shorter alias is skipped as contained.
  const ordered = [...matches].sort(
    (left, right) => tokenCount(right.aliasNorm) - tokenCount(left.aliasNorm),
  );

  for (const match of ordered) {
    const aliasTokens = match.aliasNorm.split(" ").filter(Boolean);
    if (aliasTokens.length === 0) continue;
    if (claimed.some((claim) => isContiguousRun(aliasTokens, claim))) continue;
    claimed.push(aliasTokens);

    // `dciNorms.length !== 1` is a second ambiguity signal: a brand that maps
    // to two substances must not be expanded even if the flag was not set.
    if (match.ambiguous || match.dciNorms.length !== 1) {
      if (
        ambiguousAliases.length < MAX_AMBIGUOUS_ALIASES &&
        !ambiguousAliases.includes(match.aliasRaw)
      ) {
        ambiguousAliases.push(match.aliasRaw);
      }
      continue;
    }

    for (const dci of match.dciNorms) {
      for (const token of dci.split(" ").filter(Boolean)) {
        if (appended.length >= MAX_EXPANDED_TERMS) break;
        if (original.has(token) || appended.includes(token)) continue;
        appended.push(token);
      }
    }
  }

  return {
    terms: appended.length === 0 ? terms : [...terms, ...appended],
    expandedTerms: appended,
    ambiguousAliases,
  };
}
