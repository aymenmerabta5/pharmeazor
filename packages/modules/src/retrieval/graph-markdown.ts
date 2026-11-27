import { sectionCodeForHeading } from "./chunk";
import type { GraphChunkDiagnostic, GraphSourceSpan } from "./graph-chunk-types";

/**
 * Position-preserving Markdown structure parser for `graph-evidence-v1`.
 *
 * It intentionally recognises the small Markdown surface emitted by the
 * cleaning lab, not arbitrary CommonMark: ATX headings, paragraphs, fenced
 * blocks, pipe tables, and lists. Every span is a UTF-16 half-open range into
 * the exact source string.
 */

export interface SourceLine {
  readonly start: number;
  /** Exclusive end, excluding the newline and a preceding carriage return. */
  readonly end: number;
  /** Offset immediately after the newline. */
  readonly after: number;
}

export interface ParsedTableRow {
  readonly start: number;
  readonly end: number;
}

export interface ParsedTable {
  readonly kind: "table";
  readonly blockIndex: number;
  readonly start: number;
  readonly end: number;
  /** Header and separator rows, including their trailing newline. */
  readonly headerSpan: GraphSourceSpan;
  readonly rows: readonly ParsedTableRow[];
}

export interface ParsedListItem {
  readonly start: number;
  readonly end: number;
  readonly depth: number;
  readonly markerStart: number;
  readonly markerEnd: number;
  readonly parentIndex: number | null;
}

export interface ParsedList {
  readonly kind: "list";
  readonly blockIndex: number;
  readonly start: number;
  readonly end: number;
  readonly items: readonly ParsedListItem[];
}

export interface ParsedNarrative {
  readonly kind: "narrative";
  readonly blockIndex: number;
  readonly start: number;
  readonly end: number;
  readonly atomic: boolean;
}

export type ParsedBlock = ParsedTable | ParsedList | ParsedNarrative;

export interface ParsedSection {
  readonly heading: string | null;
  readonly level: number;
  readonly headingCode: string;
  readonly sectionCode: string;
  readonly headingPath: readonly string[];
  readonly parentIndex: number | null;
  readonly sourceSpan: GraphSourceSpan;
  readonly directContentSpan: GraphSourceSpan;
  readonly blocks: readonly ParsedBlock[];
}

export interface ParsedMarkdown {
  readonly sections: readonly ParsedSection[];
  readonly diagnostics: readonly GraphChunkDiagnostic[];
}

interface HeadingOccurrence {
  readonly line: SourceLine;
  readonly level: number;
  readonly text: string;
  readonly code: string;
  readonly parentHeadingIndex: number | null;
}

interface SectionSkeleton {
  readonly heading: string | null;
  readonly level: number;
  readonly headingCode: string;
  readonly sectionCode: string;
  readonly headingPath: readonly string[];
  readonly parentIndex: number | null;
  readonly start: number;
  readonly end: number;
  readonly directStart: number;
  readonly directEnd: number;
}

interface Fence {
  readonly character: "`" | "~";
  readonly length: number;
}

const HEADING_PATTERN = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*#*\s*$/u;
const FENCE_PATTERN = /^[ \t]*(`{3,}|~{3,})/u;
const LIST_MARKER_PATTERN = /^([ \t]*)([-+*]|\d+[.)])[ \t]+/u;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u;

export function parseGraphMarkdown(source: string): ParsedMarkdown {
  const lines = lineRanges(source);
  const diagnostics: GraphChunkDiagnostic[] = [];
  const headings = parseHeadings(source, lines, diagnostics);
  const skeletons = buildSectionSkeletons(source, headings);
  const sections: ParsedSection[] = skeletons.map((section) => ({
    heading: section.heading,
    level: section.level,
    headingCode: section.headingCode,
    sectionCode: section.sectionCode,
    headingPath: section.headingPath,
    parentIndex: section.parentIndex,
    sourceSpan: { start: section.start, end: section.end },
    directContentSpan: { start: section.directStart, end: section.directEnd },
    blocks: parseBlocks(source, section.directStart, section.directEnd, diagnostics),
  }));
  return { sections, diagnostics };
}

export function lineRanges(source: string, start = 0, end = source.length): SourceLine[] {
  const lines: SourceLine[] = [];
  let position = start;
  while (position < end) {
    const newline = source.indexOf("\n", position);
    const rawEnd = newline === -1 || newline >= end ? end : newline;
    const contentEnd =
      rawEnd > position && source.charCodeAt(rawEnd - 1) === 13 ? rawEnd - 1 : rawEnd;
    const after = rawEnd < end ? rawEnd + 1 : end;
    lines.push({ start: position, end: contentEnd, after });
    position = after;
  }
  return lines;
}

export function isBlankLine(source: string, line: SourceLine): boolean {
  return source.slice(line.start, line.end).trim().length === 0;
}

export function trimSourceSpan(source: string, span: GraphSourceSpan): GraphSourceSpan | null {
  let { start, end } = span;
  while (start < end && /\s/u.test(source[start]!)) start += 1;
  while (end > start && /\s/u.test(source[end - 1]!)) end -= 1;
  return start < end ? { start, end } : null;
}

function parseHeadings(
  source: string,
  lines: readonly SourceLine[],
  diagnostics: GraphChunkDiagnostic[],
): HeadingOccurrence[] {
  const headings: HeadingOccurrence[] = [];
  const stack: number[] = [];
  let fence: Fence | null = null;

  for (const line of lines) {
    const text = lineText(source, line);
    const fenceMatch = FENCE_PATTERN.exec(text);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1]![0] === fence.character &&
        fenceMatch[1]!.length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1]![0] as "`" | "~", length: fenceMatch[1]!.length };
      continue;
    }

    const match = HEADING_PATTERN.exec(text);
    if (!match) continue;
    const level = match[1]!.length;
    const headingText = match[2]!.trim();
    if (!headingText) continue;
    while (stack.length > 0) {
      const previous = headings[stack.at(-1)!]!;
      if (previous.level < level) break;
      stack.pop();
    }
    const parentHeadingIndex = stack.at(-1) ?? null;
    headings.push({
      line,
      level,
      text: headingText,
      code: sectionCodeForHeading(headingText),
      parentHeadingIndex,
    });
    stack.push(headings.length - 1);
  }

  if (fence) {
    diagnostics.push({
      code: "unclosed_fence",
      severity: "warning",
      message: "A fenced block was not closed; its remaining lines were treated as narrative.",
    });
  }
  return headings;
}

function lineText(source: string, line: SourceLine): string {
  return source.slice(line.start, line.end);
}

function buildSectionSkeletons(
  source: string,
  headings: readonly HeadingOccurrence[],
): SectionSkeleton[] {
  const skeletons: SectionSkeleton[] = [];
  const sectionIndexByHeadingIndex = new Map<number, number>();

  if (headings.length === 0) {
    const span = trimSourceSpan(source, { start: 0, end: source.length });
    if (!span) return [];
    return [
      {
        heading: null,
        level: 0,
        headingCode: "other",
        sectionCode: "other",
        headingPath: [],
        parentIndex: null,
        start: span.start,
        end: span.end,
        directStart: span.start,
        directEnd: span.end,
      },
    ];
  }

  const firstHeadingStart = headings[0]!.line.start;
  const preamble = trimSourceSpan(source, { start: 0, end: firstHeadingStart });
  if (preamble) {
    skeletons.push({
      heading: null,
      level: 0,
      headingCode: "other",
      sectionCode: "other",
      headingPath: [],
      parentIndex: null,
      start: preamble.start,
      end: preamble.end,
      directStart: preamble.start,
      directEnd: preamble.end,
    });
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]!;
    const parentHeadingIndex = heading.parentHeadingIndex;
    const parentIndex =
      parentHeadingIndex === null
        ? null
        : (sectionIndexByHeadingIndex.get(parentHeadingIndex) ?? null);
    const parent = parentIndex === null ? null : skeletons[parentIndex]!;
    const headingPath = [...(parent?.headingPath ?? []), heading.text];
    const sectionCode = heading.code !== "other" ? heading.code : (parent?.sectionCode ?? "other");
    const directEnd = index + 1 < headings.length ? headings[index + 1]!.line.start : source.length;
    let end = source.length;
    for (let later = index + 1; later < headings.length; later += 1) {
      if (headings[later]!.level <= heading.level) {
        end = headings[later]!.line.start;
        break;
      }
    }
    sectionIndexByHeadingIndex.set(index, skeletons.length);
    skeletons.push({
      heading: heading.text,
      level: heading.level,
      headingCode: heading.code,
      sectionCode,
      headingPath,
      parentIndex,
      start: heading.line.start,
      end,
      directStart: heading.line.after,
      directEnd,
    });
  }
  return skeletons;
}

function parseBlocks(
  source: string,
  start: number,
  end: number,
  diagnostics: GraphChunkDiagnostic[],
): ParsedBlock[] {
  const trimmed = trimSourceSpan(source, { start, end });
  if (!trimmed) return [];
  const lines = lineRanges(source, trimmed.start, trimmed.end);
  const blocks: ParsedBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isBlankLine(source, lines[index]!)) {
      index += 1;
      continue;
    }

    let fence: Fence | null = null;
    let fenceEnd = index;
    const firstText = lineText(source, lines[index]!);
    const fenceMatch = FENCE_PATTERN.exec(firstText);
    if (fenceMatch) {
      fence = { character: fenceMatch[1]![0] as "`" | "~", length: fenceMatch[1]!.length };
      fenceEnd = index + 1;
      while (fenceEnd < lines.length) {
        const candidate = FENCE_PATTERN.exec(lineText(source, lines[fenceEnd]!));
        if (
          candidate &&
          candidate[1]![0] === fence.character &&
          candidate[1]!.length >= fence.length
        ) {
          break;
        }
        fenceEnd += 1;
      }
      const last = lines[Math.min(fenceEnd, lines.length - 1)]!;
      blocks.push({
        kind: "narrative",
        blockIndex: blocks.length,
        start: lines[index]!.start,
        end: last.end,
        atomic: true,
      });
      if (fenceEnd >= lines.length) {
        diagnostics.push({
          code: "unclosed_fence",
          severity: "warning",
          message: "A fenced block was not closed; it was kept as one raw narrative unit.",
          sourceSpan: { start: lines[index]!.start, end: last.end },
        });
      }
      index = fenceEnd + 1;
      continue;
    }

    const table = parseTable(source, lines, index, blocks.length, diagnostics);
    if (table) {
      blocks.push(table);
      index = tableLineEndIndex(lines, table);
      continue;
    }

    const list = parseList(source, lines, index, blocks.length);
    if (list) {
      blocks.push(list);
      index = listLineEndIndex(lines, list);
      continue;
    }

    const narrativeStart = index;
    index += 1;
    while (index < lines.length) {
      if (isBlankLine(source, lines[index]!)) break;
      if (isStructuralStart(source, lines, index)) break;
      index += 1;
    }
    const last = lines[index - 1]!;
    blocks.push({
      kind: "narrative",
      blockIndex: blocks.length,
      start: lines[narrativeStart]!.start,
      end: last.end,
      atomic: false,
    });
  }

  return blocks;
}

function isStructuralStart(source: string, lines: readonly SourceLine[], index: number): boolean {
  const line = lines[index]!;
  if (FENCE_PATTERN.test(lineText(source, line))) return true;
  if (LIST_MARKER_PATTERN.test(lineText(source, line))) return true;
  return isTableStart(source, lines, index);
}

function isTableStart(source: string, lines: readonly SourceLine[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  const header = lineText(source, lines[index]!);
  const separator = lineText(source, lines[index + 1]!);
  if (!hasUnescapedPipe(header) || !isTableSeparator(separator)) return false;
  return tableCells(header).length === tableCells(separator).length;
}

function parseTable(
  source: string,
  lines: readonly SourceLine[],
  index: number,
  blockIndex: number,
  diagnostics: GraphChunkDiagnostic[],
): ParsedTable | null {
  if (!isTableStart(source, lines, index)) return null;
  const header = lines[index]!;
  const separator = lines[index + 1]!;
  const headerCells = tableCells(lineText(source, header)).length;
  const rows: ParsedTableRow[] = [];
  let rowIndex = index + 2;
  while (rowIndex < lines.length) {
    const line = lines[rowIndex]!;
    if (isBlankLine(source, line)) break;
    const text = lineText(source, line);
    if (!hasUnescapedPipe(text) || isTableSeparator(text)) break;
    if (tableCells(text).length !== headerCells) {
      diagnostics.push({
        code: "table_column_mismatch",
        severity: "warning",
        message: "A table row has a different cell count from its header; the row was kept intact.",
        sourceSpan: { start: line.start, end: line.end },
      });
    }
    rows.push({ start: line.start, end: line.end });
    rowIndex += 1;
  }
  const last = rows.at(-1) ?? separator;
  return {
    kind: "table",
    blockIndex,
    start: header.start,
    end: last.end,
    headerSpan: { start: header.start, end: separator.after },
    rows,
  };
}

function tableLineEndIndex(lines: readonly SourceLine[], table: ParsedTable): number {
  if (table.rows.length === 0) {
    return indexOfLineEnd(lines, table.end) + 1;
  }
  return indexOfLineEnd(lines, table.rows.at(-1)!.end) + 1;
}

function parseList(
  source: string,
  lines: readonly SourceLine[],
  index: number,
  blockIndex: number,
): ParsedList | null {
  const first = LIST_MARKER_PATTERN.exec(lineText(source, lines[index]!));
  if (!first) return null;
  const baseIndent = first[1]!.length;
  let cursor = index;
  let lastNonBlank = index;
  while (cursor < lines.length) {
    const line = lines[cursor]!;
    if (isBlankLine(source, line)) {
      let next = cursor + 1;
      while (next < lines.length && isBlankLine(source, lines[next]!)) next += 1;
      if (next >= lines.length) break;
      const nextText = lineText(source, lines[next]!);
      if (LIST_MARKER_PATTERN.test(nextText) || leadingWhitespace(nextText).length > baseIndent) {
        cursor = next;
        continue;
      }
      break;
    }
    const text = lineText(source, line);
    if (LIST_MARKER_PATTERN.test(text) || leadingWhitespace(text).length > baseIndent) {
      lastNonBlank = cursor;
      cursor += 1;
      continue;
    }
    const previous = lines[cursor - 1];
    if (cursor > index && previous && !isBlankLine(source, previous)) {
      // CommonMark lazy continuation: an unindented line immediately after a
      // list item continues that item until a blank line ends the list.
      lastNonBlank = cursor;
      cursor += 1;
      continue;
    }
    break;
  }

  const itemIndexes: number[] = [];
  for (let lineIndex = index; lineIndex <= lastNonBlank; lineIndex += 1) {
    if (LIST_MARKER_PATTERN.test(lineText(source, lines[lineIndex]!))) itemIndexes.push(lineIndex);
  }
  if (itemIndexes.length === 0) return null;

  const regionEnd = lines[lastNonBlank]!.end;
  const items: ParsedListItem[] = [];
  const parentStack: number[] = [];
  for (let itemIndex = 0; itemIndex < itemIndexes.length; itemIndex += 1) {
    const lineIndex = itemIndexes[itemIndex]!;
    const line = lines[lineIndex]!;
    const match = LIST_MARKER_PATTERN.exec(lineText(source, line))!;
    const depth = match[1]!.length;
    while (parentStack.length > 0) {
      const candidate = items[parentStack.at(-1)!]!;
      if (candidate.depth < depth) break;
      parentStack.pop();
    }
    const nextLineIndex = itemIndexes[itemIndex + 1];
    items.push({
      start: line.start,
      end: nextLineIndex === undefined ? regionEnd : lines[nextLineIndex]!.start,
      depth,
      markerStart: line.start,
      markerEnd: line.start + match[0].length,
      parentIndex: parentStack.at(-1) ?? null,
    });
    parentStack.push(items.length - 1);
  }

  return {
    kind: "list",
    blockIndex,
    start: lines[index]!.start,
    end: regionEnd,
    items,
  };
}

function listLineEndIndex(lines: readonly SourceLine[], list: ParsedList): number {
  return indexOfLineEnd(lines, list.end) + 1;
}

function indexOfLineEnd(lines: readonly SourceLine[], end: number): number {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.end === end) return index;
  }
  return lines.length - 1;
}

function leadingWhitespace(text: string): string {
  return /^[ \t]*/u.exec(text)?.[0] ?? "";
}

function hasUnescapedPipe(text: string): boolean {
  return /(^|[^\\])\|/u.test(text);
}

function isTableSeparator(text: string): boolean {
  const cells = tableCells(text);
  return cells.length > 0 && cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell));
}

function tableCells(text: string): string[] {
  const trimmed = text.trim();
  const withoutEdges = trimmed.replace(/^\|/u, "").replace(/(?<!\\)\|$/u, "");
  return withoutEdges.split(/(?<!\\)\|/u).map((cell) => cell.trim());
}
