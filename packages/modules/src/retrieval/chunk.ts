import { createHash } from "node:crypto";

/**
 * Structure-aware Markdown chunking for the clinical corpus.
 *
 * The cleaner already produced Markdown with a real heading hierarchy. The
 * chunker preserves that hierarchy, maps headings to stable section codes, and
 * only falls back to a character window when a single section is oversized.
 * The chunk identity is `artifact + section code + occurrence + ordinal`, so an
 * edit near the top of a document does not renumber every later chunk.
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
  readonly sectionCode: string;
  readonly sectionHeading: string;
  readonly sectionPath: string;
  readonly ordinal: number;
  readonly content: string;
  readonly contextualizedContent: string;
  readonly contentHash: string;
  readonly tokenEstimate: number;
  readonly injectionRisk: boolean;
}

export interface ChunkingOptions {
  /** Soft maximum characters per chunk. Defaults to 3,200 (~800 tokens). */
  readonly maxChars?: number;
  /** Overlap between adjacent character windows. Defaults to 15% of max. */
  readonly overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 3_200;

interface HeadingFrame {
  readonly level: number;
  readonly text: string;
  readonly code: string;
}

interface Segment {
  readonly frames: readonly HeadingFrame[];
  readonly headingLine: string;
  readonly body: string;
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

export function chunkMarkdownDocument(
  document: ChunkSourceDocument,
  markdown: string,
  options: ChunkingOptions = {},
): ChunkDraft[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? Math.max(0, Math.floor(maxChars * 0.15));
  if (!Number.isInteger(maxChars) || maxChars < 400) {
    throw new Error("Chunk maxChars must be an integer of at least 400");
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("Chunk overlapChars must be a non-negative integer below maxChars");
  }

  const body = sanitizeRetrievalText(stripFrontMatter(markdown));
  const segments = splitIntoSegments(body);
  const occurrences = new Map<string, number>();
  const chunks: ChunkDraft[] = [];

  for (const segment of segments) {
    const deepest = segment.frames.at(-1);
    // A subsection such as `### Adultes` inherits the nearest mapped ancestor
    // (`dosage`), so a section filter still finds it.
    const sectionCode = deepestMappedCode(segment.frames);
    const occurrence = occurrences.get(sectionCode) ?? 0;
    occurrences.set(sectionCode, occurrence + 1);
    const sectionPath =
      segment.frames.length > 0
        ? segment.frames.map((frame) => frame.text).join(" > ")
        : document.title;
    const sectionHeading = deepest?.text ?? document.title;
    const parts = splitSection(segment.headingLine, segment.body, maxChars, overlapChars);

    for (let ordinal = 0; ordinal < parts.length; ordinal += 1) {
      const content = parts[ordinal]!;
      const contextualizedContent = contextualize(document, sectionPath, content);
      chunks.push({
        chunkId: `${document.artifactId}#${sectionCode}-${occurrence}#${ordinal}`,
        artifactId: document.artifactId,
        sectionCode,
        sectionHeading,
        sectionPath,
        ordinal,
        content,
        contextualizedContent,
        contentHash: sha256(contextualizedContent),
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
    stack.push({ level, text, code: sectionCodeForHeading(text) });
  }
  flush();

  if (segments.length === 0) {
    const text = sanitizeRetrievalText(markdown);
    if (text) segments.push({ frames: [], headingLine: "", body: text });
  }
  return segments;
}

function splitSection(
  headingLine: string,
  body: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  const prefix = headingLine ? `${headingLine}\n\n` : "";
  if (prefix.length + body.length <= maxChars) return [`${prefix}${body}`.trim()];
  const parts = splitBody(body, Math.max(400, maxChars - prefix.length), overlapChars);
  return parts.map((part) => `${prefix}${part}`.trim());
}

function splitBody(body: string, maxChars: number, overlapChars: number): string[] {
  if (body.length <= maxChars) return [body];
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
    if (paragraph.length > maxChars) {
      flush();
      for (const piece of splitOversized(paragraph, maxChars)) parts.push(piece);
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
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
    result.push(candidate.length <= maxChars + overlapChars ? candidate : parts[index]!);
  }
  return result;
}

function contextualize(
  document: ChunkSourceDocument,
  sectionPath: string,
  content: string,
): string {
  const identity =
    [document.inn, document.brandName].filter(Boolean).join(" / ") ||
    document.medicineNames.join(", ") ||
    "unknown medicine";
  const strength = document.strengthForm ? `, ${document.strengthForm}` : "";
  const jurisdiction = document.jurisdiction ?? "unknown jurisdiction";
  const note =
    `${document.title} — ${identity}${strength}. ` +
    `${document.documentType} in ${document.language}. ` +
    `Source: ${document.sourceName} (authority ${document.authorityLevel}/4, ${jurisdiction}). ` +
    `Section: ${sectionPath}.`;
  return `${note}\n\n${content}`;
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
