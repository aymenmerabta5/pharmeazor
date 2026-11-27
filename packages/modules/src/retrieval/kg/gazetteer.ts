import type { KgEntityType, KgMentionMethod } from "./types";
import { tokenizeWithOffsets, type KgToken } from "./normalize";

/**
 * Token-indexed gazetteer with longest-match semantics.
 *
 * A regex built from thousands of aliases is slow to compile and prone to
 * escaping mistakes. Matching folded tokens against an index keyed by the first
 * token is deterministic, accent-insensitive, and returns offsets into the
 * original text. Overlapping matches are discarded in favour of the longest
 * one, so `comprimé pelliculé sécable` wins over `comprimé`.
 */

export interface GazetteerSeed {
  readonly entityId: string;
  readonly entityType: KgEntityType;
  readonly aliasRaw: string;
  readonly confidence: number;
  readonly method?: KgMentionMethod;
}

export interface GazetteerMatch {
  readonly entityId: string;
  readonly entityType: KgEntityType;
  readonly surface: string;
  /** UTF-16 code-unit offset into the text passed to `match`. */
  readonly start: number;
  /** Exclusive UTF-16 code-unit end offset. */
  readonly end: number;
  readonly method: KgMentionMethod;
  readonly confidence: number;
  readonly aliasRaw: string;
}

interface IndexedEntry extends GazetteerSeed {
  readonly tokens: readonly string[];
  readonly method: KgMentionMethod;
}

export class Gazetteer {
  private readonly byFirstToken = new Map<string, IndexedEntry[]>();

  constructor(seeds: readonly GazetteerSeed[]) {
    const seen = new Set<string>();
    for (const seed of seeds) {
      const tokens = tokenizeWithOffsets(seed.aliasRaw).map((token) => token.norm);
      if (tokens.length === 0) continue;
      const identity = `${seed.entityId}\u0000${tokens.join(" ")}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const entry: IndexedEntry = {
        ...seed,
        tokens,
        method: seed.method ?? "gazetteer",
      };
      const bucket = this.byFirstToken.get(tokens[0]!);
      if (bucket) bucket.push(entry);
      else this.byFirstToken.set(tokens[0]!, [entry]);
    }
    for (const bucket of this.byFirstToken.values()) {
      bucket.sort(
        (left, right) =>
          right.tokens.length - left.tokens.length ||
          right.aliasRaw.length - left.aliasRaw.length ||
          left.entityId.localeCompare(right.entityId),
      );
    }
  }

  get size(): number {
    let size = 0;
    for (const bucket of this.byFirstToken.values()) size += bucket.length;
    return size;
  }

  match(text: string): GazetteerMatch[] {
    const tokens = tokenizeWithOffsets(text);
    if (tokens.length === 0) return [];
    const candidates: GazetteerMatch[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
      const bucket = this.byFirstToken.get(tokens[index]!.norm);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (index + entry.tokens.length > tokens.length) continue;
        if (!matchesAt(tokens, index, entry.tokens)) continue;
        const first = tokens[index]!;
        const last = tokens[index + entry.tokens.length - 1]!;
        candidates.push({
          entityId: entry.entityId,
          entityType: entry.entityType,
          surface: text.slice(first.start, last.end),
          start: first.start,
          end: last.end,
          method: entry.method,
          confidence: entry.confidence,
          aliasRaw: entry.aliasRaw,
        });
      }
    }

    return keepLongestNonOverlapping(candidates);
  }
}

function matchesAt(tokens: readonly KgToken[], index: number, expected: readonly string[]): boolean {
  for (let offset = 0; offset < expected.length; offset += 1) {
    if (tokens[index + offset]?.norm !== expected[offset]) return false;
  }
  return true;
}

/**
 * Prefer the longest match at each position.
 *
 * Two entities of different types may legitimately share an exact span (a brand
 * named after its substance is the common case), so equal spans are kept once
 * per entity type. Partially overlapping spans are not: keeping `comprimé` from
 * inside `comprimé pelliculé sécable` would inflate the mention table with a
 * worse entity.
 */
function keepLongestNonOverlapping(candidates: readonly GazetteerMatch[]): GazetteerMatch[] {
  const ordered = [...candidates].sort(
    (left, right) =>
      left.start - right.start ||
      right.end - right.start - (left.end - left.start) ||
      left.entityType.localeCompare(right.entityType) ||
      left.entityId.localeCompare(right.entityId),
  );
  const accepted: GazetteerMatch[] = [];
  const acceptedTypesBySpan = new Map<string, Set<string>>();

  for (const candidate of ordered) {
    const conflict = accepted.some((existing) => {
      if (existing.end <= candidate.start || candidate.end <= existing.start) return false;
      const exactSpan = existing.start === candidate.start && existing.end === candidate.end;
      return !exactSpan;
    });
    if (conflict) continue;
    const spanKey = `${candidate.start}:${candidate.end}`;
    const types = acceptedTypesBySpan.get(spanKey) ?? new Set<string>();
    if (types.has(candidate.entityType)) continue;
    types.add(candidate.entityType);
    acceptedTypesBySpan.set(spanKey, types);
    accepted.push(candidate);
  }

  return accepted.sort((left, right) => left.start - right.start || left.end - right.end);
}
