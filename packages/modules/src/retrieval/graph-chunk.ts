import { createHash } from "node:crypto";
import {
  RETRIEVAL_TEXT_HELPER_VERSION,
  SECTION_TAXONOMY_VERSION,
  detectRetrievalInjection,
  stripFrontMatter,
  type ChunkSourceDocument,
} from "./chunk";
import {
  GRAPH_CHUNKER_VERSION,
  GRAPH_CHUNKING_PROFILE,
  GRAPH_OFFSET_ENCODING,
  GRAPH_OFFSET_SURFACE,
  type GraphBlockKind,
  type GraphChunkDiagnostic,
  type GraphChunkingConfig,
  type GraphChunkingOptions,
  type GraphChunkingResult,
  type GraphDocumentBody,
  type GraphDocumentSection,
  type GraphGeneratedSpan,
  type GraphListMetadata,
  type GraphOverlap,
  type GraphOverlapAlignment,
  type GraphSourceSpan,
  type GraphTableMetadata,
  type GraphTextUnit,
} from "./graph-chunk-types";
import { assertValidGraphChunkingResult } from "./graph-chunk-validation";
import { graphDocumentSnapshotId, graphScopedTextUnitId } from "./graph-identity";
import {
  parseGraphMarkdown,
  type ParsedBlock,
  type ParsedList,
  type ParsedNarrative,
  type ParsedSection,
  type ParsedTable,
} from "./graph-markdown";

/**
 * Graph-compatible chunking profile.
 *
 * The legacy `chunkMarkdownDocument` remains the production hybrid profile.
 * This profile is additive and source-mapped: every raw text unit is an exact
 * slice of the clean Markdown body, every section is heading-delimited, and
 * overlap is recorded instead of being inferred from reconstructed text.
 */

const DEFAULT_MAX_CHARS = 4_096;
const SENTENCE_END_PATTERN = /[.!?…؟۔]+(?:["'»”’)\]]+)?(?=\s|$)/gu;
const WORD_PATTERN = /\S+/gu;
const NON_TERMINAL_ABBREVIATIONS = [
  "approx.",
  "art.",
  "cf.",
  "dr.",
  "e.g.",
  "env.",
  "fig.",
  "i.e.",
  "no.",
  "p. ex.",
  "p. ex",
  "pr.",
  "ref.",
  "réf.",
  "tab.",
  "vol.",
] as const;

type AtomBoundary = GraphOverlapAlignment;

interface SplitAtom {
  readonly start: number;
  readonly end: number;
  readonly boundary: AtomBoundary;
  readonly tableRowId?: string;
  readonly list?: ListAtomMetadata;
}

interface ListAtomMetadata {
  readonly listId: string;
  readonly itemId: string;
  readonly parentItemId: string | null;
  readonly itemOrdinal: number;
  readonly depth: number;
  readonly markerSpan: GraphSourceSpan;
  readonly marker: boolean;
  readonly partOrdinal: number;
  readonly continued: boolean;
}

interface SegmentTable {
  readonly tableId: string;
  readonly headerSpan: GraphSourceSpan;
  readonly rowIds: readonly string[];
  readonly headerIncluded: boolean;
}

interface SegmentList {
  readonly listId: string;
  readonly itemIds: readonly string[];
  readonly itemParts: readonly GraphListMetadata["itemParts"][number][];
}

interface Segment {
  readonly blockKind: GraphBlockKind;
  readonly blockId: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly atoms: readonly SplitAtom[];
  readonly table: SegmentTable | null;
  readonly list: SegmentList | null;
}

interface SectionPlan {
  readonly section: GraphDocumentSection;
  readonly segments: readonly Segment[];
}

interface UnitPlan {
  readonly section: GraphDocumentSection;
  readonly segment: Segment;
  readonly legacyChunkId: string;
  readonly textUnitId: string;
  readonly unitSnapshotId: string;
  readonly ordinal: number;
  readonly documentOrdinal: number;
}

interface OverlapSelection {
  readonly start: number;
  readonly alignment: GraphOverlapAlignment;
}

export function graphDocumentBody(markdown: string): GraphDocumentBody {
  const text = stripFrontMatter(markdown);
  return {
    text,
    contentSha256: sha256(text),
  };
}

/** Resolve and version the effective graph chunking configuration. */
export function graphChunkingConfig(options: GraphChunkingOptions = {}): GraphChunkingConfig {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? Math.max(0, Math.floor(maxChars * 0.15));
  if (!Number.isInteger(maxChars) || maxChars < 400) {
    throw new Error("Graph chunk maxChars must be an integer of at least 400");
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error("Graph chunk overlapChars must be a non-negative integer below maxChars");
  }
  const configHash = sha256(
    [
      GRAPH_CHUNKING_PROFILE,
      GRAPH_CHUNKER_VERSION,
      SECTION_TAXONOMY_VERSION,
      RETRIEVAL_TEXT_HELPER_VERSION,
      GRAPH_OFFSET_SURFACE,
      GRAPH_OFFSET_ENCODING,
      String(maxChars),
      String(overlapChars),
    ].join("\u0000"),
  );
  return {
    profile: GRAPH_CHUNKING_PROFILE,
    algorithmVersion: GRAPH_CHUNKER_VERSION,
    sectionTaxonomyVersion: SECTION_TAXONOMY_VERSION,
    textHelperVersion: RETRIEVAL_TEXT_HELPER_VERSION,
    offsetSurface: GRAPH_OFFSET_SURFACE,
    offsetEncoding: GRAPH_OFFSET_ENCODING,
    maxChars,
    overlapChars,
    configHash,
  };
}

export function chunkGraphMarkdownDocument(
  document: ChunkSourceDocument,
  markdown: string,
  options: GraphChunkingOptions = {},
): GraphChunkingResult {
  const config = graphChunkingConfig(options);
  const { maxChars, overlapChars, configHash } = config;

  const body = graphDocumentBody(markdown);
  if (
    options.expectedDocumentContentSha256 &&
    body.contentSha256 !== options.expectedDocumentContentSha256
  ) {
    throw new Error(
      `Graph source hash mismatch: manifest declares ${options.expectedDocumentContentSha256}, clean body is ${body.contentSha256}`,
    );
  }
  const documentSnapshotId = graphDocumentSnapshotId(
    config.profile,
    configHash,
    document.artifactId,
    body.contentSha256,
  );
  const parsed = parseGraphMarkdown(body.text);
  const diagnostics: GraphChunkDiagnostic[] = [...parsed.diagnostics];
  const sections = buildSections(document.artifactId, body.text, parsed.sections);
  const plans: SectionPlan[] = sections.map((section, index) => ({
    section,
    segments: parsed.sections[index]!.blocks.flatMap((block) =>
      segmentsForBlock(body.text, section, block, maxChars - overlapChars, diagnostics),
    ),
  }));

  const occurrences = new Map<string, number>();
  const unitPlans: UnitPlan[] = [];
  let documentOrdinal = 0;
  for (const plan of plans) {
    if (plan.segments.length === 0) continue;
    const occurrence = occurrences.get(plan.section.sectionCode) ?? 0;
    occurrences.set(plan.section.sectionCode, occurrence + 1);
    for (let ordinal = 0; ordinal < plan.segments.length; ordinal += 1) {
      const legacyChunkId = `${document.artifactId}#${plan.section.sectionCode}-${occurrence}#${ordinal}`;
      unitPlans.push({
        section: plan.section,
        segment: plan.segments[ordinal]!,
        legacyChunkId,
        textUnitId: graphScopedTextUnitId(
          config.profile,
          configHash,
          documentSnapshotId,
          legacyChunkId,
        ),
        unitSnapshotId: documentSnapshotId,
        ordinal,
        documentOrdinal,
      });
      documentOrdinal += 1;
    }
  }

  const textUnits: GraphTextUnit[] = [];
  for (let index = 0; index < unitPlans.length; index += 1) {
    const plan = unitPlans[index]!;
    const previous = unitPlans[index - 1];
    const previousSegment =
      previous && previous.section.sectionId === plan.section.sectionId ? previous.segment : null;
    const overlap = chooseOverlap(body.text, previousSegment, plan.segment, overlapChars, maxChars);
    if (
      overlapChars > 0 &&
      previousSegment &&
      previousSegment.blockId === plan.segment.blockId &&
      !overlap
    ) {
      diagnostics.push({
        code: "overlap_omitted",
        severity: "info",
        message:
          "No complete semantic boundary fitted the overlap window; the unit starts at its unique content.",
        sectionId: plan.section.sectionId,
        textUnitId: plan.textUnitId,
        sourceSpan: { start: plan.segment.sourceStart, end: plan.segment.sourceEnd },
      });
    }
    textUnits.push(
      buildTextUnit(
        body.text,
        plan,
        document.documentId,
        document.title,
        previous?.textUnitId ?? null,
        overlap,
        overlapChars,
      ),
    );
  }

  const result: GraphChunkingResult = {
    ...config,
    artifactId: document.artifactId,
    documentId: document.documentId,
    title: document.title,
    sourceId: document.sourceId,
    language: document.language,
    documentContentSha256: body.contentSha256,
    documentSnapshotId,
    sections,
    textUnits,
    diagnostics,
  };
  assertValidGraphChunkingResult(body, result);
  return result;
}

function buildSections(
  artifactId: string,
  source: string,
  parsed: readonly ParsedSection[],
): GraphDocumentSection[] {
  const sections: GraphDocumentSection[] = [];
  for (const section of parsed) {
    const parent = section.parentIndex === null ? null : sections[section.parentIndex]!;
    const contentSha256 = sha256(source.slice(section.sourceSpan.start, section.sourceSpan.end));
    const directContentSha256 = sha256(
      source.slice(section.directContentSpan.start, section.directContentSpan.end),
    );
    const sectionId = `sec_${sha256(
      [
        GRAPH_CHUNKING_PROFILE,
        artifactId,
        String(section.sourceSpan.start),
        section.headingPath.join("\u001f"),
        contentSha256,
      ].join("\u0000"),
    ).slice(0, 32)}`;
    sections.push({
      sectionId,
      artifactId,
      parentSectionId: parent?.sectionId ?? null,
      ancestorSectionIds: parent ? [...parent.ancestorSectionIds, parent.sectionId] : [],
      heading: section.heading,
      level: section.level,
      headingCode: section.headingCode,
      sectionCode: section.sectionCode,
      headingPath: section.headingPath,
      sourceSpan: section.sourceSpan,
      directContentSpan: section.directContentSpan,
      contentSha256,
      directContentSha256,
    });
  }
  return sections;
}

function segmentsForBlock(
  source: string,
  section: GraphDocumentSection,
  block: ParsedBlock,
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): Segment[] {
  const blockId = `${section.sectionId}:block-${block.blockIndex}`;
  if (block.kind === "table") {
    return tableSegments(source, section, block, blockId, budget, diagnostics);
  }
  if (block.kind === "list") {
    return listSegments(source, section, block, blockId, budget, diagnostics);
  }
  return narrativeSegments(source, section, block, blockId, budget, diagnostics);
}

function narrativeSegments(
  source: string,
  section: GraphDocumentSection,
  block: ParsedNarrative,
  blockId: string,
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): Segment[] {
  const atoms = block.atomic
    ? [{ start: block.start, end: block.end, boundary: "block" as const }]
    : semanticAtoms(source, section, block.start, block.end, budget, diagnostics);
  return groupAtoms(atoms, budget).map((group) => {
    const segment = makeSegment("narrative", blockId, group, null, null);
    addOversizeDiagnostic(source, section, segment, budget, diagnostics);
    return segment;
  });
}

function tableSegments(
  source: string,
  section: GraphDocumentSection,
  block: ParsedTable,
  blockId: string,
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): Segment[] {
  const tableId = `${blockId}:table`;
  const rows = block.rows.map((row, index) => ({
    ...row,
    rowId: `${tableId}:row-${index + 1}`,
  }));
  if (rows.length === 0) {
    const segment = makeSegment(
      "table",
      blockId,
      [],
      {
        tableId,
        headerSpan: block.headerSpan,
        rowIds: [],
        headerIncluded: true,
      },
      null,
      { start: block.start, end: block.end },
    );
    addOversizeDiagnostic(source, section, segment, budget, diagnostics);
    return [segment];
  }

  const segments: Segment[] = [];
  let group: (typeof rows)[number][] = [];
  let groupStart = block.start;
  let first = true;
  const flush = () => {
    if (group.length === 0) return;
    const last = group.at(-1)!;
    const segment = makeSegment(
      "table",
      blockId,
      group.map((row) => ({
        start: row.start,
        end: row.end,
        boundary: "table-row" as const,
        tableRowId: row.rowId,
      })),
      {
        tableId,
        headerSpan: block.headerSpan,
        rowIds: group.map((row) => row.rowId),
        headerIncluded: first,
      },
      null,
      { start: groupStart, end: last.end },
    );
    addOversizeDiagnostic(source, section, segment, budget, diagnostics);
    segments.push(segment);
    first = false;
    group = [];
  };

  for (const row of rows) {
    if (group.length > 0) {
      const candidateStart = groupStart;
      if (source.slice(candidateStart, row.end).length > budget) {
        flush();
        groupStart = row.start;
      }
    }
    if (group.length === 0) {
      groupStart = first ? block.start : row.start;
    }
    group.push(row);
  }
  flush();
  return segments;
}

function listSegments(
  source: string,
  section: GraphDocumentSection,
  block: ParsedList,
  blockId: string,
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): Segment[] {
  const listId = `${blockId}:list`;
  const segments: Segment[] = [];
  let pending: SplitAtom[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const segment = makeSegment(
      "list",
      blockId,
      pending,
      null,
      listMetadataFromAtoms(listId, pending),
    );
    addOversizeDiagnostic(source, section, segment, budget, diagnostics);
    segments.push(segment);
    pending = [];
  };

  for (let index = 0; index < block.items.length; index += 1) {
    const item = block.items[index]!;
    const itemId = `${listId}:item-${index + 1}`;
    const itemAtoms = listItemAtoms(source, section, item, budget, diagnostics);
    const atoms = itemAtoms.map((atom, atomIndex) => ({
      ...atom,
      list: {
        listId,
        itemId,
        parentItemId: item.parentIndex === null ? null : `${listId}:item-${item.parentIndex + 1}`,
        itemOrdinal: index,
        depth: item.depth,
        markerSpan: { start: item.markerStart, end: item.markerEnd },
        marker: atomIndex === 0,
        partOrdinal: 0,
        continued: false,
      },
    }));
    if (item.end - item.start <= budget) {
      if (pending.length > 0) {
        const candidateLength = item.end - pending[0]!.start;
        if (candidateLength > budget) flush();
      }
      pending.push(...atoms);
      continue;
    }

    flush();
    const parts = groupAtoms(atoms, budget);
    for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
      const partAtoms = parts[partIndex]!.map((atom) => ({
        ...atom,
        list: {
          ...atom.list!,
          partOrdinal: partIndex,
          continued: partIndex > 0,
        },
      }));
      const segment = makeSegment(
        "list",
        blockId,
        partAtoms,
        null,
        listMetadataFromAtoms(listId, partAtoms),
      );
      addOversizeDiagnostic(source, section, segment, budget, diagnostics);
      segments.push(segment);
    }
  }
  flush();
  return segments;
}

function listMetadataFromAtoms(listId: string, atoms: readonly SplitAtom[]): SegmentList {
  const itemIds: string[] = [];
  const itemParts: GraphListMetadata["itemParts"][number][] = [];
  const seen = new Set<string>();
  for (const atom of atoms) {
    if (!atom.list) continue;
    if (!itemIds.includes(atom.list.itemId)) itemIds.push(atom.list.itemId);
    const key = `${atom.list.itemId}\u0000${atom.list.partOrdinal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    itemParts.push({
      itemId: atom.list.itemId,
      parentItemId: atom.list.parentItemId,
      itemOrdinal: atom.list.itemOrdinal,
      depth: atom.list.depth,
      markerSpan: atom.list.markerSpan,
      partOrdinal: atom.list.partOrdinal,
      continued: atom.list.continued,
    });
  }
  return { listId, itemIds, itemParts };
}

function makeSegment(
  blockKind: GraphBlockKind,
  blockId: string,
  atoms: readonly SplitAtom[],
  table: SegmentTable | null,
  list: SegmentList | null,
  explicitSpan?: GraphSourceSpan,
): Segment {
  const span =
    explicitSpan ??
    (atoms.length > 0 ? { start: atoms[0]!.start, end: atoms.at(-1)!.end } : { start: 0, end: 0 });
  return {
    blockKind,
    blockId,
    sourceStart: span.start,
    sourceEnd: span.end,
    atoms,
    table,
    list,
  };
}

function listItemAtoms(
  source: string,
  section: GraphDocumentSection,
  item: ParsedList["items"][number],
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): SplitAtom[] {
  const markerLength = item.markerEnd - item.start;
  const bodyAtoms = semanticAtoms(
    source,
    section,
    item.markerEnd,
    item.end,
    Math.max(1, budget - markerLength),
    diagnostics,
  );
  if (bodyAtoms.length === 0) {
    return [{ start: item.start, end: item.end, boundary: "list-item" }];
  }
  return bodyAtoms.map((atom, index) =>
    index === 0 ? { ...atom, start: item.start, boundary: "list-item" } : atom,
  );
}

function semanticAtoms(
  source: string,
  section: GraphDocumentSection,
  start: number,
  end: number,
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): SplitAtom[] {
  const atoms: SplitAtom[] = [];
  for (const sentence of sentenceRanges(source, start, end)) {
    if (sentence.end - sentence.start <= budget) {
      atoms.push({ ...sentence, boundary: "sentence" });
      continue;
    }
    const words = wordRanges(source, sentence.start, sentence.end);
    const groups = groupAtoms(
      words.map((word) => ({ ...word, boundary: "word" as const })),
      budget,
    );
    for (const group of groups) {
      const atom = group[0]!;
      if (atom.end - atom.start > budget) {
        diagnostics.push({
          code: "oversized_atomic_block",
          severity: "warning",
          message: "A single unbroken word exceeds the configured ceiling and was kept intact.",
          sectionId: section.sectionId,
          sourceSpan: { start: atom.start, end: atom.end },
        });
      }
      atoms.push(...group);
    }
    diagnostics.push({
      code: "forced_word_boundary",
      severity: "info",
      message: "A sentence exceeded the ceiling and was split at word boundaries.",
      sectionId: section.sectionId,
      sourceSpan: sentence,
    });
  }
  return atoms;
}

function groupAtoms(atoms: readonly SplitAtom[], budget: number): SplitAtom[][] {
  const groups: SplitAtom[][] = [];
  let group: SplitAtom[] = [];
  for (const atom of atoms) {
    if (group.length > 0 && atom.end - group[0]!.start > budget) {
      groups.push(group);
      group = [];
    }
    group.push(atom);
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

function sentenceRanges(source: string, start: number, end: number): GraphSourceSpan[] {
  if (start >= end) return [];
  const fragment = source.slice(start, end);
  const ranges: GraphSourceSpan[] = [];
  let cursor = 0;
  SENTENCE_END_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END_PATTERN.exec(fragment)) !== null) {
    const boundary = match.index + match[0].length;
    if (isNonTerminalAbbreviation(fragment, boundary)) continue;
    addTrimmedRange(ranges, source, start + cursor, start + boundary);
    cursor = boundary;
  }
  addTrimmedRange(ranges, source, start + cursor, end);
  return ranges;
}

function isNonTerminalAbbreviation(fragment: string, boundary: number): boolean {
  const context = fragment.slice(Math.max(0, boundary - 24), boundary).toLowerCase();
  if (context.endsWith("p.") && /^\s*ex\./iu.test(fragment.slice(boundary))) return true;
  return NON_TERMINAL_ABBREVIATIONS.some((abbreviation) => context.endsWith(abbreviation));
}

function wordRanges(source: string, start: number, end: number): GraphSourceSpan[] {
  const fragment = source.slice(start, end);
  const ranges: GraphSourceSpan[] = [];
  WORD_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_PATTERN.exec(fragment)) !== null) {
    ranges.push({ start: start + match.index, end: start + match.index + match[0].length });
  }
  return ranges;
}

function addTrimmedRange(
  ranges: GraphSourceSpan[],
  source: string,
  start: number,
  end: number,
): void {
  const span = trimRange(source, start, end);
  if (span) ranges.push(span);
}

function trimRange(source: string, start: number, end: number): GraphSourceSpan | null {
  let from = start;
  let to = end;
  while (from < to && /\s/u.test(source[from]!)) from += 1;
  while (to > from && /\s/u.test(source[to - 1]!)) to -= 1;
  return from < to ? { start: from, end: to } : null;
}

function addOversizeDiagnostic(
  source: string,
  section: GraphDocumentSection,
  segment: Segment,
  budget: number,
  diagnostics: GraphChunkDiagnostic[],
): void {
  if (source.slice(segment.sourceStart, segment.sourceEnd).length <= budget) return;
  diagnostics.push({
    code: segment.blockKind === "table" ? "atomic-table-row-overflow" : "oversized_atomic_block",
    severity: "warning",
    message:
      segment.blockKind === "table"
        ? "A table header or row exceeded the ceiling and was kept intact."
        : "A structural block exceeded the ceiling and was kept intact.",
    sectionId: section.sectionId,
    sourceSpan: { start: segment.sourceStart, end: segment.sourceEnd },
  });
}

function chooseOverlap(
  source: string,
  previous: Segment | null,
  current: Segment,
  requestedChars: number,
  maxChars: number,
): OverlapSelection | null {
  if (!previous || requestedChars < 1) return null;
  if (previous.blockId !== current.blockId) return null;
  if (previous.sourceEnd > current.sourceStart) return null;
  const target = Math.max(previous.sourceStart, current.sourceStart - requestedChars);
  const candidates = previous.atoms.filter(
    (atom) => !atom.list?.marker && atom.start >= target && atom.start < previous.sourceEnd,
  );
  for (const candidate of candidates) {
    const length = source.slice(candidate.start, current.sourceEnd).length;
    if (length > maxChars) continue;
    return { start: candidate.start, alignment: candidate.boundary };
  }
  return null;
}

function buildTextUnit(
  source: string,
  plan: UnitPlan,
  documentId: string,
  documentTitle: string,
  predecessorTextUnitId: string | null,
  overlap: OverlapSelection | null,
  requestedOverlap: number,
): GraphTextUnit {
  const segment = plan.segment;
  const sourceStart = overlap?.start ?? segment.sourceStart;
  const content = source.slice(sourceStart, segment.sourceEnd);
  const overlapLength = segment.sourceStart - sourceStart;
  const overlaps: GraphOverlap[] =
    overlap && predecessorTextUnitId && overlapLength > 0
      ? [
          {
            predecessorTextUnitId,
            sourceSpan: { start: sourceStart, end: segment.sourceStart },
            localSpan: { start: 0, end: overlapLength },
            requestedChars: requestedOverlap,
            actualChars: overlapLength,
            alignment: overlap.alignment,
          },
        ]
      : [];
  const table = segment.table
    ? ({
        tableId: segment.table.tableId,
        headerSpan: segment.table.headerSpan,
        rowIds: segment.table.rowIds,
        headerIncluded: segment.table.headerIncluded,
      } satisfies GraphTableMetadata)
    : null;
  const list = segment.list
    ? ({
        listId: segment.list.listId,
        itemIds: segment.list.itemIds,
        itemParts: segment.list.itemParts,
      } satisfies GraphListMetadata)
    : null;
  const display = buildDisplayContent(source, segment, content);
  return {
    profile: GRAPH_CHUNKING_PROFILE,
    textUnitId: plan.textUnitId,
    legacyChunkId: plan.legacyChunkId,
    artifactId: plan.section.artifactId,
    documentId,
    documentSnapshotId: plan.unitSnapshotId,
    documentOrdinal: plan.documentOrdinal,
    sectionId: plan.section.sectionId,
    sectionHeading: plan.section.heading ?? documentTitle,
    sectionPath: plan.section.headingPath,
    sectionLevel: plan.section.level,
    headingCode: plan.section.headingCode,
    sectionCode: plan.section.sectionCode,
    ordinal: plan.ordinal,
    content,
    displayContent: display.content,
    rawContentSha256: sha256(content),
    sourceSpan: { start: sourceStart, end: segment.sourceEnd },
    uniqueSourceSpan: { start: segment.sourceStart, end: segment.sourceEnd },
    uniqueLocalSpan: { start: overlapLength, end: content.length },
    overlaps,
    blockKind: segment.blockKind,
    blockIds: [segment.blockId],
    table,
    list,
    generatedSpans: display.generatedSpans,
    tokenEstimate: Math.ceil(content.length / 4),
    injectionRisk: detectRetrievalInjection(content),
  };
}

function buildDisplayContent(
  source: string,
  segment: Segment,
  content: string,
): { readonly content: string; readonly generatedSpans: readonly GraphGeneratedSpan[] } {
  let prefix = "";
  let generated: GraphGeneratedSpan | null = null;
  if (segment.table && !segment.table.headerIncluded) {
    prefix = source.slice(segment.table.headerSpan.start, segment.table.headerSpan.end);
    generated = {
      kind: "table-header",
      localSpan: { start: 0, end: prefix.length },
      sourceSpan: segment.table.headerSpan,
    };
  } else if (segment.blockKind === "list" && segment.atoms[0]?.list?.continued) {
    const marker = segment.atoms[0].list.markerSpan;
    prefix = source.slice(marker.start, marker.end);
    generated = {
      kind: "list-marker",
      localSpan: { start: 0, end: prefix.length },
      sourceSpan: marker,
    };
  }
  return {
    content: `${prefix}${content}`,
    generatedSpans: generated ? [generated] : [],
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
