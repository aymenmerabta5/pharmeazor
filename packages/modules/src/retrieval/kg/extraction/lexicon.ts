import { foldKgText, tokenizeWithOffsets, type KgToken } from "../normalize";
import { mentionKindDefinition, type MentionFamily, type MentionKind } from "./mention-kinds";
import type {
  MentionLexiconMatch,
  MentionLexiconPort,
  MentionLexiconSeed,
  MentionLexiconSourceRef,
} from "./types";

interface IndexedMentionLexiconEntry {
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly surface: string;
  readonly normalizedSurface: string;
  readonly tokens: readonly string[];
  readonly sourceRefs: readonly MentionLexiconSourceRef[];
  readonly attributes: Readonly<Record<string, unknown>>;
}

/**
 * Deterministic, token-indexed mention lexicon.
 *
 * It intentionally returns only candidate kinds and lexicon provenance. No
 * canonical entity ID is produced; linking is a later, separately reviewed
 * stage.
 */
export class MentionLexicon implements MentionLexiconPort {
  private readonly byFirstToken = new Map<string, IndexedMentionLexiconEntry[]>();
  private readonly sizeValue: number;

  constructor(seeds: readonly MentionLexiconSeed[]) {
    const merged = new Map<string, MutableEntry>();
    for (const seed of seeds) {
      const surface = seed.surface.replace(/\s+/g, " ").trim();
      if (surface.length < 2 || surface.length > 300) continue;
      const normalizedSurface = foldKgText(surface);
      if (!normalizedSurface) continue;
      const tokens = tokenizeWithOffsets(surface).map((token) => token.norm);
      if (tokens.length === 0 || tokens.length > 30) continue;
      const key = `${seed.candidateKind}\u0000${normalizedSurface}`;
      const existing = merged.get(key);
      if (existing) {
        addSourceRef(existing.sourceRefs, {
          sourceKind: seed.sourceKind,
          sourceId: seed.sourceId,
          sourceKey: seed.sourceKey,
        });
        mergeAttributes(existing.attributes, seed.attributes);
        continue;
      }
      merged.set(key, {
        candidateKind: seed.candidateKind,
        family: mentionKindDefinition(seed.candidateKind).family,
        surface,
        normalizedSurface,
        tokens,
        sourceRefs: [
          {
            sourceKind: seed.sourceKind,
            sourceId: seed.sourceId,
            sourceKey: seed.sourceKey,
          },
        ],
        attributes: sanitizeAttributes(seed.attributes),
      });
    }

    for (const entry of merged.values()) {
      const bucket = this.byFirstToken.get(entry.tokens[0]!) ?? [];
      bucket.push(entry);
      this.byFirstToken.set(entry.tokens[0]!, bucket);
    }
    for (const bucket of this.byFirstToken.values()) {
      bucket.sort(
        (left, right) =>
          right.tokens.length - left.tokens.length ||
          mentionKindDefinition(right.candidateKind).priority -
            mentionKindDefinition(left.candidateKind).priority ||
          left.candidateKind.localeCompare(right.candidateKind),
      );
    }
    this.sizeValue = merged.size;
  }

  get size(): number {
    return this.sizeValue;
  }

  match(text: string): readonly MentionLexiconMatch[] {
    const tokens = tokenizeWithOffsets(text);
    if (tokens.length === 0) return [];
    const candidates: MentionLexiconMatch[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const bucket = this.byFirstToken.get(tokens[index]!.norm);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (index + entry.tokens.length > tokens.length) continue;
        if (!matchesAt(tokens, index, entry.tokens)) continue;
        const first = tokens[index]!;
        const last = tokens[index + entry.tokens.length - 1]!;
        const surfaceText = text.slice(first.start, last.end);
        candidates.push({
          candidateKind: entry.candidateKind,
          family: entry.family,
          surfaceText,
          normalizedSurface: entry.normalizedSurface,
          start: first.start,
          end: last.end,
          matchQuality: surfaceText === entry.surface ? "exact" : "normalized",
          sourceRefs: entry.sourceRefs,
          attributes: entry.attributes,
        });
      }
    }
    return keepLongestNonOverlapping(candidates);
  }
}

interface MutableEntry {
  readonly candidateKind: MentionKind;
  readonly family: MentionFamily;
  readonly surface: string;
  readonly normalizedSurface: string;
  readonly tokens: readonly string[];
  readonly sourceRefs: MentionLexiconSourceRef[];
  readonly attributes: Record<string, unknown>;
}

function matchesAt(
  tokens: readonly KgToken[],
  index: number,
  expected: readonly string[],
): boolean {
  for (let offset = 0; offset < expected.length; offset += 1) {
    if (tokens[index + offset]?.norm !== expected[offset]) return false;
  }
  return true;
}

function keepLongestNonOverlapping(
  candidates: readonly MentionLexiconMatch[],
): MentionLexiconMatch[] {
  const ordered = [...candidates].sort(
    (left, right) =>
      left.start - right.start ||
      right.end - right.start - (left.end - left.start) ||
      mentionKindDefinition(right.candidateKind).priority -
        mentionKindDefinition(left.candidateKind).priority ||
      left.candidateKind.localeCompare(right.candidateKind),
  );
  const accepted: MentionLexiconMatch[] = [];
  const acceptedKeys = new Set<string>();
  for (const candidate of ordered) {
    const key = `${candidate.start}:${candidate.end}:${candidate.candidateKind}`;
    if (acceptedKeys.has(key)) continue;
    const conflict = accepted.some((existing) => {
      if (existing.end <= candidate.start || candidate.end <= existing.start) return false;
      const exactSpan = existing.start === candidate.start && existing.end === candidate.end;
      return !exactSpan;
    });
    if (conflict) continue;
    acceptedKeys.add(key);
    accepted.push(candidate);
  }
  return accepted.sort(
    (left, right) =>
      left.start - right.start ||
      left.end - right.end ||
      left.candidateKind.localeCompare(right.candidateKind),
  );
}

function addSourceRef(refs: MentionLexiconSourceRef[], ref: MentionLexiconSourceRef): void {
  if (
    refs.some(
      (existing) =>
        existing.sourceKind === ref.sourceKind &&
        existing.sourceId === ref.sourceId &&
        existing.sourceKey === ref.sourceKey,
    )
  ) {
    return;
  }
  refs.push(ref);
}

function sanitizeAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!attributes) return {};
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

function mergeAttributes(
  target: Record<string, unknown>,
  incoming: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!incoming) return;
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === "") continue;
    if (target[key] === undefined) target[key] = value;
  }
}

export function buildMentionLexicon(seeds: readonly MentionLexiconSeed[]): MentionLexicon {
  return new MentionLexicon(seeds);
}
