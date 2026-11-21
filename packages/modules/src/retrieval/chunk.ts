import { createHash } from "node:crypto";

/**
 * Structure-aware Markdown chunking for the clinical corpus.
 *
 * The cleaner already produced Markdown with a real heading hierarchy. The
 * chunker keeps that hierarchy, packs consecutive subsections of one document
 * section into chunks of 512-1024 tokens, and only falls back to a character
 * window when a single section is oversized.
 *
 * Two identities are kept apart on purpose:
 *
 * - `contextKey` hashes the artifact plus the raw chunk text. It is the key a
 *   model-written context note is stored under, so a note survives as long as
 *   the chunk text does.
 * - `contentHash` hashes the final contextualized text (note + content). It is
 *   what decides re-embedding, because the embedding covers the note too.
 *
 * The chunk id is `artifact + primary section code + occurrence + ordinal`, so
 * an edit near the top of a document does not renumber every later chunk.
 */

export interface ChunkSourceDocument {
  readonly artifactId: string;
  readonly documentId: string;
  readonly title: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly authorityLevel: number;
  readonly jurisdiction: string | null;
  readonly documentType: string;
  readonly language: string;
  readonly medicineIds: readonly string[];
  readonly medicineNames: readonly string[];
  readonly inn: string | null;
  readonly brandName: string | null;
  readonly strengthForm: string | null;
  readonly sourceUrls: readonly string[];
}

export interface ChunkDraft {
  readonly chunkId: string;
  readonly artifactId: string;
  /** Primary section code: the first mapped code in the packed chunk. */
  readonly sectionCode: string;
  /** Every section code the packed chunk covers, in document order. */
  readonly sectionCodes: readonly string[];
  readonly sectionHeading: string;
  readonly sectionPath: string;
  readonly ordinal: number;
  readonly content: string;
  /** The note actually prepended: model-written when available, else the fallback. */
  readonly contextNote: string;
  readonly contextualizedContent: string;
  /** Hash of `contextualizedContent`; decides re-embedding. */
  readonly contentHash: string;
  /** Hash of `artifactId + content`; the key a model note is stored under. */
  readonly contextKey: string;
  readonly tokenEstimate: number;
  readonly injectionRisk: boolean;
}

export interface ChunkingOptions {
  /** Soft maximum characters per chunk. Defaults to 4,096 (~1,024 tokens). */
  readonly maxChars?: number;
  /** Overlap between adjacent character windows. Defaults to 15% of max. */
  readonly overlapChars?: number;
  /**
   * Model-written context notes keyed by `contextKey`. A missing note falls
   * back to the deterministic document note.
   */
  readonly contextNotes?: ReadonlyMap<string, string>;
  /** Sections smaller than this are packed into a neighbour. Defaults to 800. */
  readonly minGroupChars?: number;
}

const DEFAULT_MAX_CHARS = 4_096;
const DEFAULT_MIN_GROUP_CHARS = 800;

interface HeadingFrame {
  readonly id: number;
  readonly level: number;
  readonly text: string;
  readonly code: string;
}

interface Segment {
  readonly frames: readonly HeadingFrame[];
  readonly headingLine: string;
  readonly body: string;
}

interface Group {
  readonly segments: readonly Segment[];
  /** One heading path per source section that was packed into this group. */
  readonly headingPaths: readonly string[];
  readonly chars: number;
}

const INJECTION_PATTERNS: readonly RegExp[] = [
  /\bignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|directions?)\b/i,
  /\bdisregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)\b/i,
  /\bforget\s+(all\s+)?(previous|prior|above)\s+instructions?\b/i,
  /\byou\s+are\s+now\s+(a|an|the)\s+/i,
  /\bsystem\s*(prompt|message)\s*[:=]/i,
  /\breveal\s+(your|the)\s+(system\s+)?prompt\b/i,
  /<\|?(system|assistant|developer)\|?>/i,
  /\[\/?INST\]/i,
  /\bdo\s+anything\s+now\b/i,
  /\bignore[zr]?\s+(toutes\s+)?(les\s+)?instructions?\b/i,
  /\bnouvelles?\s+instructions?\s*[:=]/i,
];

/** Strip invisible Unicode and control characters before indexing. */
export function sanitizeRetrievalText(input: string): string {
  return (
    input
      .replace(/\r\n?/g, "\n")
      // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[^\S\n]+/g, " ")
      .replace(/[^\S\n]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** High-confidence instruction-override phrases, not clinical wording. */
export function detectRetrievalInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/** Stable key for a model-written context note. */
export function contextKeyFor(artifactId: string, content: string): string {
  return sha256(`${artifactId}\u0000${content}`);
}

export function chunkMarkdownDocument(
  document: ChunkSourceDocument,
  markdown: string,
  options: ChunkingOptions = {},
): ChunkDraft[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? Math.max(0, Math.floor(maxChars * 0.15));
  const minGroupChars = options.minGroupChars ?? DEFAULT_MIN_GROUP_CHARS;
  if (!Number.isInteger(maxChars) || maxChars < 400) {
    throw new Error("Chunk maxChars must be an integer of at least 400");
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("Chunk overlapChars must be a non-negative integer below maxChars");
  }

  const body = sanitizeRetrievalText(stripFrontMatter(markdown));
  const segments = splitIntoSegments(body);
  const groups = packGroups(
    groupSegments(segments, document.title),
    maxChars,
    Math.min(minGroupChars, maxChars),
  );
  const occurrences = new Map<string, number>();
  const chunks: ChunkDraft[] = [];

  for (const group of groups) {
    const codes = uniqueCodes(group.segments);
    const primary = codes.find((code) => code !== "other") ?? "other";
    const occurrence = occurrences.get(primary) ?? 0;
    occurrences.set(primary, occurrence + 1);
    const sectionPath = group.headingPaths.join(" | ") || document.title;
    const sectionHeading = groupSectionHeading(group, document.title);
    const parts = splitBody(groupText(group), maxChars, overlapChars);

    for (let ordinal = 0; ordinal < parts.length; ordinal += 1) {
      const content = parts[ordinal]!;
      const contextKey = contextKeyFor(document.artifactId, content);
      const contextNote =
        options.contextNotes?.get(contextKey) ??
        buildDefaultContextNote(document, sectionPath, content);
      const contextualizedContent = `${contextNote}\n\n${content}`;
      chunks.push({
        chunkId: `${document.artifactId}#${primary}-${occurrence}#${ordinal}`,
        artifactId: document.artifactId,
        sectionCode: primary,
        sectionCodes: codes,
        sectionHeading,
        sectionPath,
        ordinal,
        content,
        contextNote,
        contextualizedContent,
        contentHash: sha256(contextualizedContent),
        contextKey,
        tokenEstimate: Math.ceil(content.length / 4),
        injectionRisk: detectRetrievalInjection(content),
      });
    }
  }

  return chunks;
}

export function stripFrontMatter(markdown: string): string {
  if (!markdown.startsWith("---")) return markdown;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown);
  if (!match) return markdown;
  return markdown.slice(match[0].length).replace(/^(?:\r?\n)+/, "");
}

function splitIntoSegments(markdown: string): Segment[] {
  const lines = markdown.split("\n");
  const stack: HeadingFrame[] = [];
  const segments: Segment[] = [];
  let body: string[] = [];
  let nextHeadingId = 0;

  const flush = () => {
    const text = body.join("\n").trim();
    body = [];
    if (!text) return;
    const deepest = stack.at(-1);
    segments.push({
      frames: [...stack],
      headingLine: deepest ? `${"#".repeat(deepest.level)} ${deepest.text}` : "",
      body: text,
    });
  };

  for (const line of lines) {
    const heading = /^(#{1,6})[ \t]+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) {
      body.push(line);
      continue;
    }
    flush();
    const level = heading[1]!.length;
    const text = heading[2]!.trim();
    if (!text) continue;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ id: nextHeadingId, level, text, code: sectionCodeForHeading(text) });
    nextHeadingId += 1;
  }
  flush();

  if (segments.length === 0) {
    const text = sanitizeRetrievalText(markdown);
    if (text) segments.push({ frames: [], headingLine: "", body: text });
  }
  return segments;
}

/**
 * Pick the heading level that actually divides the document. A lone H1 title
 * does not count, so a SmPC with one title and thirty H2 sections groups by H2
 * while a DailyMed label with twelve H1 sections groups by H1.
 */
function groupLevelFor(segments: readonly Segment[]): number | null {
  const distinct = new Map<number, Set<string>>();
  for (const segment of segments) {
    for (const frame of segment.frames) {
      const set = distinct.get(frame.level) ?? new Set<string>();
      set.add(frame.text);
      distinct.set(frame.level, set);
    }
  }
  const levels = [...distinct.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    if ((distinct.get(level)?.size ?? 0) >= 2) return level;
  }
  return levels[0] ?? null;
}

function groupSegments(segments: readonly Segment[], title: string): Group[] {
  const groupLevel = groupLevelFor(segments);
  const groups: Group[] = [];
  let current: { key: string; segments: Segment[] } | null = null;

  for (const segment of segments) {
    const key = groupKey(segment, groupLevel);
    if (!current || current.key !== key) {
      if (current) groups.push(buildGroup(current.segments, groupLevel, title));
      current = { key, segments: [segment] };
      continue;
    }
    current.segments.push(segment);
  }
  if (current) groups.push(buildGroup(current.segments, groupLevel, title));
  return groups;
}

function groupKey(segment: Segment, groupLevel: number | null): string {
  if (groupLevel === null) return "";
  const frame = frameAtOrAbove(segment.frames, groupLevel);
  return frame ? `${frame.level}:${frame.id}` : "";
}

function buildGroup(segments: readonly Segment[], groupLevel: number | null, title: string): Group {
  const first = segments[0]!;
  const path = headingPath(first, groupLevel, title);
  return {
    segments,
    headingPaths: path ? [path] : [],
    chars: segments.reduce((total, segment) => total + segmentChars(segment), 0),
  };
}

function headingPath(segment: Segment, groupLevel: number | null, title: string): string {
  const frames =
    groupLevel === null
      ? segment.frames
      : segment.frames.filter((frame) => frame.level <= groupLevel);
  const texts = frames.map((frame) => frame.text);
  // A single H1 above the grouping level is the document title, not a section.
  if (groupLevel !== null && groupLevel > 1 && texts.length > 1) texts.shift();
  if (texts[0] === title) texts.shift();
  return texts.join(" > ");
}

function frameAtOrAbove(frames: readonly HeadingFrame[], level: number): HeadingFrame | undefined {
  let candidate: HeadingFrame | undefined;
  for (const frame of frames) {
    if (frame.level <= level) candidate = frame;
  }
  return candidate;
}

function segmentChars(segment: Segment): number {
  return segment.headingLine.length + segment.body.length + 2;
}

function groupText(group: Group): string {
  return group.segments
    .map((segment) => `${segment.headingLine}\n\n${segment.body}`.trim())
    .join("\n\n");
}

/** Merge undersized groups into their predecessor while the budget allows. */
function packGroups(groups: readonly Group[], maxChars: number, minGroupChars: number): Group[] {
  const packed: Group[] = [];
  for (const group of groups) {
    const last = packed.at(-1);
    if (last && group.chars < minGroupChars && last.chars + group.chars <= maxChars) {
      packed[packed.length - 1] = {
        segments: [...last.segments, ...group.segments],
        headingPaths: [...last.headingPaths, ...group.headingPaths],
        chars: last.chars + group.chars,
      };
      continue;
    }
    packed.push(group);
  }
  return packed;
}

function uniqueCodes(segments: readonly Segment[]): string[] {
  const codes: string[] = [];
  for (const segment of segments) {
    const code = deepestMappedCode(segment.frames);
    if (!codes.includes(code)) codes.push(code);
  }
  return codes.length > 0 ? codes : ["other"];
}

function deepestHeading(segments: readonly Segment[]): string | undefined {
  const first = segments[0];
  if (!first) return undefined;
  return first.frames.at(-1)?.text;
}

/** The section-level heading a packed chunk belongs to. */
function groupSectionHeading(group: Group, title: string): string {
  const path = group.headingPaths[0];
  if (!path) return deepestHeading(group.segments) ?? title;
  const parts = path.split(" > ");
  return parts.at(-1) ?? title;
}

function splitBody(body: string, maxChars: number, overlapChars: number): string[] {
  if (body.length <= maxChars) return [body];
  // The overlap is carried inside the ceiling, not on top of it: each part is
  // built to `budget` and the repeated tail brings the final text back up to
  // `maxChars` at most.
  const budget = Math.max(400, maxChars - overlapChars);
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const parts: string[] = [];
  let current = "";

  const flush = () => {
    if (!current) return;
    parts.push(current);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > budget) {
      flush();
      for (const piece of splitOversized(paragraph, budget)) parts.push(piece);
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= budget) {
      current = candidate;
      continue;
    }
    flush();
    current = paragraph;
  }
  flush();

  if (parts.length === 0) return [body];
  return applyOverlap(parts, overlapChars, maxChars);
}

function splitOversized(text: string, maxChars: number): string[] {
  const sentences = text.split(/(?<=[.!?…])\s+/u);
  const pieces: string[] = [];
  let current = "";
  const flush = () => {
    if (!current) return;
    pieces.push(current);
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      flush();
      pieces.push(...splitWords(sentence, maxChars));
      continue;
    }
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    flush();
    current = sentence;
  }
  flush();
  return pieces.length > 0 ? pieces : [text];
}

function splitWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    pieces.push(current);
    current = word;
  }
  if (current) pieces.push(current);
  return pieces;
}

function applyOverlap(parts: readonly string[], overlapChars: number, maxChars: number): string[] {
  if (overlapChars < 1 || parts.length < 2) return [...parts];
  const result = [parts[0]!];
  for (let index = 1; index < parts.length; index += 1) {
    const previous = parts[index - 1]!;
    const tail = previous.slice(Math.max(0, previous.length - overlapChars));
    const boundary = tail.search(/\s/);
    const cleanTail = boundary >= 0 ? tail.slice(boundary + 1) : tail;
    const candidate = cleanTail ? `${cleanTail}\n\n${parts[index]}` : parts[index]!;
    result.push(candidate.length <= maxChars ? candidate : parts[index]!);
  }
  return result;
}

/**
 * Deterministic fallback note. It is deliberately built from document metadata
 * only: it names the medicine, the source and the section, which is the part
 * the corpus already knows for certain. The model-written note replaces it
 * whenever one exists for the chunk.
 */
function buildDefaultContextNote(
  document: ChunkSourceDocument,
  sectionPath: string,
  _content: string,
): string {
  const identity =
    [document.inn, document.brandName].filter(Boolean).join(" / ") ||
    document.medicineNames.join(", ") ||
    "unknown medicine";
  const strength = document.strengthForm ? `, ${document.strengthForm}` : "";
  const jurisdiction = document.jurisdiction ?? "unknown jurisdiction";
  return (
    `${document.title} — ${identity}${strength}. ` +
    `${document.documentType} in ${document.language}. ` +
    `Source: ${document.sourceName} (${jurisdiction}). ` +
    `Section: ${sectionPath}.`
  );
}

const HEADING_CODES: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "contraindications",
    ["contre-indication", "contraindication", "do not use", "ne prenez jamais"],
  ],
  ["interactions", ["interaction"]],
  [
    "dosage",
    ["posologie", "mode d'administration", "dosage and administration", "dosage", "directions"],
  ],
  ["indications", ["indication", "uses"]],
  [
    "warnings",
    ["mise en garde", "mises en garde", "avertissement", "warning", "precaution", "ask a doctor"],
  ],
  ["pregnancy", ["grossesse", "allaitement", "fertilite", "pregnancy", "nursing"]],
  [
    "adverse_effects",
    ["effet indesirable", "effets indesirables", "adverse reaction", "side effect"],
  ],
  ["overdose", ["surdosage", "overdosage", "overdose"]],
  ["pharmacodynamics", ["pharmacodynami"]],
  ["pharmacokinetics", ["pharmacocineti", "pharmacokinetic"]],
  ["pharmacology", ["pharmacolog", "clinical pharmacology"]],
  ["composition", ["composition", "formule"]],
  ["denomination", ["denomination", "name of the medicinal product"]],
  ["nomenclature_registered", ["produits enregistres", "registered products"]],
  ["nomenclature_non_renewed", ["produits non renouveles", "non renewed products"]],
  ["nomenclature_withdrawn", ["produits retires", "withdrawn products"]],
  ["storage", ["conservation", "stockage", "storage", "shelf life"]],
  ["package", ["emballage", "presentation", "package", "how supplied"]],
  ["excipients", ["excipient"]],
  [
    "patient_information",
    ["patient information", "notice patient", "information patient", "patient counseling"],
  ],
  [
    "administrative",
    ["information administrative", "administrative", "marketing authorization", "titulaire"],
  ],
  ["revision", ["mise a jour", "revision"]],
  ["pharmaceutical_data", ["donnees pharmaceutiques", "pharmaceutical data"]],
];

export function sectionCodeForHeading(heading: string): string {
  const normalized = heading
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  for (const [code, keywords] of HEADING_CODES) {
    if (keywords.some((keyword) => headingMatches(normalized, keyword))) return code;
  }
  return "other";
}

function headingMatches(normalized: string, keyword: string): boolean {
  if (keyword.includes(" ")) return normalized.includes(keyword);
  if (keyword.length > 6) return normalized.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "u").test(normalized);
}

function deepestMappedCode(frames: readonly HeadingFrame[]): string {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const code = frames[index]?.code;
    if (code && code !== "other") return code;
  }
  return "other";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
