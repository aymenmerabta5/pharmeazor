import { createHash } from "node:crypto";
import {
  GRAPH_CHUNKER_VERSION,
  GRAPH_CHUNKING_PROFILE,
  GRAPH_OFFSET_ENCODING,
  GRAPH_OFFSET_SURFACE,
  type GraphChunkingResult,
  type GraphDocumentBody,
  type GraphDocumentSection,
  type GraphEvidenceSpan,
  type GraphSourceSpan,
  type GraphTextUnit,
} from "./graph-chunk-types";
import { graphDocumentSnapshotId, graphScopedTextUnitId } from "./graph-identity";

const LEGACY_CHUNK_ID_PATTERN = /^([A-Za-z0-9_.-]+)#([a-z][a-z0-9_]{1,47})-([0-9]+)#([0-9]+)$/u;

/**
 * Assert that a mechanical evidence span points at raw content, never display
 * text or a generated prefix.
 */
export function graphEvidenceSpan(
  unit: GraphTextUnit,
  start: number,
  end: number,
): GraphEvidenceSpan {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    throw new Error(`Invalid graph evidence span [${start}, ${end})`);
  }
  if (end > unit.content.length) {
    throw new Error(`Graph evidence span ends after raw content (${end} > ${unit.content.length})`);
  }
  if (splitSurrogatePair(unit.content, start) || splitSurrogatePair(unit.content, end)) {
    throw new Error("Graph evidence span splits a UTF-16 surrogate pair");
  }
  if (start < unit.uniqueLocalSpan.start || end > unit.uniqueLocalSpan.end) {
    throw new Error("Graph evidence span is outside the unit's unique source region");
  }
  if (sha256(unit.content) !== unit.rawContentSha256) {
    throw new Error(`Graph text unit ${unit.textUnitId} has a raw content hash mismatch`);
  }
  const quote = unit.content.slice(start, end);
  return {
    textUnitId: unit.textUnitId,
    documentSnapshotId: unit.documentSnapshotId,
    rawContentSha256: unit.rawContentSha256,
    offsetEncoding: GRAPH_OFFSET_ENCODING,
    start,
    end,
    documentStart: unit.sourceSpan.start + start,
    documentEnd: unit.sourceSpan.start + end,
    quote,
    quoteSha256: sha256(quote),
  };
}

/** Validate document, section, text-unit, source-span, and display invariants. */
export function assertValidGraphChunkingResult(
  body: GraphDocumentBody,
  result: GraphChunkingResult,
): void {
  if (body.contentSha256 !== result.documentContentSha256) {
    throw new Error("Graph result document hash does not match the supplied body");
  }
  if (sha256(body.text) !== result.documentContentSha256) {
    throw new Error("Graph body content does not match its declared hash");
  }
  if (
    result.profile !== GRAPH_CHUNKING_PROFILE ||
    result.algorithmVersion !== GRAPH_CHUNKER_VERSION ||
    result.offsetSurface !== GRAPH_OFFSET_SURFACE ||
    result.offsetEncoding !== GRAPH_OFFSET_ENCODING
  ) {
    throw new Error("Graph result declares an unsupported profile or version");
  }
  const expectedConfigHash = sha256(
    [
      result.profile,
      result.algorithmVersion,
      result.sectionTaxonomyVersion,
      result.textHelperVersion,
      result.offsetSurface,
      result.offsetEncoding,
      String(result.maxChars),
      String(result.overlapChars),
    ].join("\u0000"),
  );
  if (result.configHash !== expectedConfigHash) {
    throw new Error("Graph configuration hash does not match the effective chunking configuration");
  }
  const expectedSnapshotId = graphDocumentSnapshotId(
    result.profile,
    result.configHash,
    result.artifactId,
    result.documentContentSha256,
  );
  if (result.documentSnapshotId !== expectedSnapshotId) {
    throw new Error("Graph document snapshot id does not match the document and configuration");
  }

  const sections = new Map<string, GraphDocumentSection>();
  for (const section of result.sections) {
    if (sections.has(section.sectionId)) {
      throw new Error(`Duplicate graph section id ${section.sectionId}`);
    }
    assertSpanInBounds(section.sourceSpan, body.text.length, "section source");
    assertSpanInBounds(section.directContentSpan, body.text.length, "section direct content");
    assertContained(section.directContentSpan, section.sourceSpan, "section direct content");
    if (
      sha256(body.text.slice(section.sourceSpan.start, section.sourceSpan.end)) !==
      section.contentSha256
    ) {
      throw new Error(`Graph section ${section.sectionId} content hash mismatch`);
    }
    if (
      sha256(body.text.slice(section.directContentSpan.start, section.directContentSpan.end)) !==
      section.directContentSha256
    ) {
      throw new Error(`Graph section ${section.sectionId} direct content hash mismatch`);
    }
    if (
      section.parentSectionId !== null &&
      !result.sections.some((entry) => entry.sectionId === section.parentSectionId)
    ) {
      throw new Error(`Graph section ${section.sectionId} references a missing parent`);
    }
    sections.set(section.sectionId, section);
  }

  if (body.text.trim().length > 0 && result.sections.length === 0) {
    throw new Error("A non-empty graph document must have at least one section");
  }
  for (const section of result.sections) {
    const parent = section.parentSectionId === null ? null : sections.get(section.parentSectionId)!;
    const expectedAncestors = parent ? [...parent.ancestorSectionIds, parent.sectionId] : [];
    if (!sameStrings(section.ancestorSectionIds, expectedAncestors)) {
      throw new Error(`Graph section ${section.sectionId} has an invalid ancestor chain`);
    }
    if (parent) assertContained(section.sourceSpan, parent.sourceSpan, "child section");
    if (section.heading === null) {
      if (section.headingPath.length !== 0) {
        throw new Error(`Graph section ${section.sectionId} has a path without a heading`);
      }
    } else if (
      section.headingPath.at(-1) !== section.heading ||
      !sameStrings(section.headingPath.slice(0, -1), parent?.headingPath ?? [])
    ) {
      throw new Error(`Graph section ${section.sectionId} has an invalid heading path`);
    }
  }

  const unitIndexById = new Map<string, number>();
  const sectionPartCounts = new Map<string, number>();
  let previousSourceStart = -1;
  let previousUniqueStart = -1;
  for (const [index, unit] of result.textUnits.entries()) {
    if (unitIndexById.has(unit.textUnitId)) {
      throw new Error(`Duplicate graph text unit id ${unit.textUnitId}`);
    }
    const expectedTextUnitId = graphScopedTextUnitId(
      result.profile,
      result.configHash,
      result.documentSnapshotId,
      unit.legacyChunkId,
    );
    if (unit.textUnitId !== expectedTextUnitId) {
      throw new Error(`Graph text unit ${unit.textUnitId} is not profile/config scoped`);
    }
    const chunkMatch = LEGACY_CHUNK_ID_PATTERN.exec(unit.legacyChunkId);
    if (!chunkMatch) {
      throw new Error(`Graph legacy chunk id ${unit.legacyChunkId} does not preserve the grammar`);
    }
    if (chunkMatch[1] !== result.artifactId) {
      throw new Error(`Graph text unit ${unit.textUnitId} has the wrong artifact id`);
    }
    if (Number(chunkMatch[4]) !== unit.ordinal) {
      throw new Error(`Graph text unit ${unit.textUnitId} has the wrong part ordinal`);
    }
    const section = sections.get(unit.sectionId);
    if (!section) {
      throw new Error(`Graph text unit ${unit.textUnitId} references a missing section`);
    }
    if (chunkMatch[2] !== section.sectionCode) {
      throw new Error(
        `Graph text unit ${unit.textUnitId} chunk id disagrees with its section code`,
      );
    }
    if (
      unit.sectionHeading !== (section.heading ?? result.title) ||
      unit.sectionLevel !== section.level ||
      unit.headingCode !== section.headingCode ||
      unit.sectionCode !== section.sectionCode ||
      !sameStrings(unit.sectionPath, section.headingPath)
    ) {
      throw new Error(`Graph text unit ${unit.textUnitId} has denormalized section metadata drift`);
    }
    if (
      unit.profile !== result.profile ||
      unit.artifactId !== result.artifactId ||
      unit.documentId !== result.documentId ||
      unit.documentSnapshotId !== result.documentSnapshotId
    ) {
      throw new Error(`Graph text unit ${unit.textUnitId} has the wrong document identity`);
    }
    if (unit.documentOrdinal !== index) {
      throw new Error(`Graph text unit ${unit.textUnitId} has a non-sequential document ordinal`);
    }
    const expectedPart = sectionPartCounts.get(unit.sectionId) ?? 0;
    if (unit.ordinal !== expectedPart) {
      throw new Error(`Graph text unit ${unit.textUnitId} has a non-sequential section ordinal`);
    }
    sectionPartCounts.set(unit.sectionId, expectedPart + 1);

    assertSpanInBounds(unit.sourceSpan, body.text.length, "text unit source");
    assertSpanInBounds(unit.uniqueSourceSpan, body.text.length, "text unit unique source");
    assertSpanInBounds(unit.uniqueLocalSpan, unit.content.length, "text unit unique local");
    assertContained(unit.sourceSpan, section.directContentSpan, "text unit source");
    assertContained(unit.uniqueSourceSpan, section.directContentSpan, "text unit unique source");
    if (unit.sourceSpan.start > unit.uniqueSourceSpan.start) {
      throw new Error(`Graph text unit ${unit.textUnitId} has an invalid unique source span`);
    }
    if (unit.uniqueSourceSpan.end !== unit.sourceSpan.end) {
      throw new Error(`Graph text unit ${unit.textUnitId} unique source does not end the unit`);
    }
    if (unit.sourceSpan.start + unit.uniqueLocalSpan.start !== unit.uniqueSourceSpan.start) {
      throw new Error(`Graph text unit ${unit.textUnitId} unique source/local offset mismatch`);
    }
    if (unit.uniqueLocalSpan.end !== unit.content.length) {
      throw new Error(`Graph text unit ${unit.textUnitId} unique local span is not terminal`);
    }
    const raw = body.text.slice(unit.sourceSpan.start, unit.sourceSpan.end);
    if (raw !== unit.content) {
      throw new Error(`Graph text unit ${unit.textUnitId} content is not the exact source slice`);
    }
    if (sha256(raw) !== unit.rawContentSha256) {
      throw new Error(`Graph text unit ${unit.textUnitId} raw hash mismatch`);
    }
    if (
      body.text.slice(unit.uniqueSourceSpan.start, unit.uniqueSourceSpan.end) !==
      unit.content.slice(unit.uniqueLocalSpan.start, unit.uniqueLocalSpan.end)
    ) {
      throw new Error(`Graph text unit ${unit.textUnitId} unique source mapping mismatch`);
    }
    if (unit.sourceSpan.start <= previousSourceStart) {
      throw new Error(`Graph text unit ${unit.textUnitId} is out of source order`);
    }
    if (unit.uniqueSourceSpan.start <= previousUniqueStart) {
      throw new Error(`Graph text unit ${unit.textUnitId} has a non-advancing unique span`);
    }
    previousSourceStart = unit.sourceSpan.start;
    previousUniqueStart = unit.uniqueSourceSpan.start;

    if (unit.blockKind === "table") {
      if (!unit.table || unit.list) {
        throw new Error(`Graph table unit ${unit.textUnitId} has invalid structure metadata`);
      }
      assertSpanInBounds(unit.table.headerSpan, body.text.length, "table header");
      assertContained(unit.table.headerSpan, section.directContentSpan, "table header");
      if (unit.table.headerIncluded !== (unit.sourceSpan.start === unit.table.headerSpan.start)) {
        throw new Error(`Graph table unit ${unit.textUnitId} header flag disagrees with its span`);
      }
      if (new Set(unit.table.rowIds).size !== unit.table.rowIds.length) {
        throw new Error(`Graph table unit ${unit.textUnitId} repeats a row id`);
      }
    } else if (unit.blockKind === "list") {
      if (!unit.list || unit.table) {
        throw new Error(`Graph list unit ${unit.textUnitId} has invalid structure metadata`);
      }
      if (new Set(unit.list.itemIds).size !== unit.list.itemIds.length) {
        throw new Error(`Graph list unit ${unit.textUnitId} repeats an item id`);
      }
      for (const part of unit.list.itemParts) {
        if (!unit.list.itemIds.includes(part.itemId)) {
          throw new Error(`Graph list unit ${unit.textUnitId} has an unlisted item part`);
        }
        if (part.continued !== part.partOrdinal > 0) {
          throw new Error(`Graph list unit ${unit.textUnitId} has an invalid continuation flag`);
        }
        assertSpanInBounds(part.markerSpan, body.text.length, "list marker");
        assertContained(part.markerSpan, section.directContentSpan, "list marker");
      }
    } else if (unit.table || unit.list) {
      throw new Error(`Graph narrative unit ${unit.textUnitId} has structural metadata`);
    }

    if (unit.overlaps.length > 1) {
      throw new Error(`Graph text unit ${unit.textUnitId} has more than one overlap in v1`);
    }
    const generatedLength = validateGeneratedSpans(body, unit);
    if (unit.displayContent.slice(generatedLength) !== unit.content) {
      throw new Error(`Graph text unit ${unit.textUnitId} display content lost its raw suffix`);
    }
    unitIndexById.set(unit.textUnitId, index);
  }

  for (const [index, unit] of result.textUnits.entries()) {
    for (const overlap of unit.overlaps) {
      const predecessorIndex = unitIndexById.get(overlap.predecessorTextUnitId);
      if (predecessorIndex === undefined || predecessorIndex >= index) {
        throw new Error(
          `Graph text unit ${unit.textUnitId} does not reference an earlier overlap predecessor`,
        );
      }
      const predecessor = result.textUnits[predecessorIndex]!;
      if (
        overlap.localSpan.start !== 0 ||
        overlap.localSpan.end !== unit.uniqueLocalSpan.start ||
        overlap.sourceSpan.start !== unit.sourceSpan.start ||
        overlap.sourceSpan.end !== unit.uniqueSourceSpan.start
      ) {
        throw new Error(`Graph text unit ${unit.textUnitId} overlap span mismatch`);
      }
      if (
        overlap.actualChars <= 0 ||
        overlap.actualChars !== overlap.localSpan.end ||
        overlap.sourceSpan.end - overlap.sourceSpan.start !== overlap.actualChars ||
        overlap.actualChars > overlap.requestedChars ||
        overlap.requestedChars !== result.overlapChars
      ) {
        throw new Error(`Graph text unit ${unit.textUnitId} overlap size mismatch`);
      }
      if (predecessor.blockIds[0] !== unit.blockIds[0]) {
        throw new Error(`Graph text unit ${unit.textUnitId} overlaps outside its source block`);
      }
      if (
        body.text.slice(overlap.sourceSpan.start, overlap.sourceSpan.end) !==
        unit.content.slice(overlap.localSpan.start, overlap.localSpan.end)
      ) {
        throw new Error(`Graph text unit ${unit.textUnitId} overlap quote mismatch`);
      }
      if (
        overlap.sourceSpan.start < predecessor.uniqueSourceSpan.start ||
        overlap.sourceSpan.start >= predecessor.uniqueSourceSpan.end
      ) {
        throw new Error(
          `Graph text unit ${unit.textUnitId} overlap starts outside its predecessor`,
        );
      }
    }
  }

  const hasDirectContent = result.sections.some(
    (section) =>
      body.text.slice(section.directContentSpan.start, section.directContentSpan.end).trim()
        .length > 0,
  );
  if (hasDirectContent && result.textUnits.length === 0) {
    throw new Error("Graph sections contain direct content but produced no text units");
  }
}

function validateGeneratedSpans(body: GraphDocumentBody, unit: GraphTextUnit): number {
  if (unit.generatedSpans.length === 0) {
    if (unit.displayContent !== unit.content) {
      throw new Error(`Graph text unit ${unit.textUnitId} has unreported display content`);
    }
    return 0;
  }
  let prefixLength = 0;
  for (const generated of unit.generatedSpans) {
    assertSpanInBounds(generated.localSpan, unit.displayContent.length, "generated local");
    assertSpanInBounds(generated.sourceSpan, body.text.length, "generated source");
    if (generated.localSpan.start !== prefixLength) {
      throw new Error(`Graph text unit ${unit.textUnitId} has a non-contiguous generated prefix`);
    }
    if (
      generated.localSpan.end - generated.localSpan.start !==
      generated.sourceSpan.end - generated.sourceSpan.start
    ) {
      throw new Error(`Graph text unit ${unit.textUnitId} generated prefix length mismatch`);
    }
    if (
      unit.displayContent.slice(generated.localSpan.start, generated.localSpan.end) !==
      body.text.slice(generated.sourceSpan.start, generated.sourceSpan.end)
    ) {
      throw new Error(`Graph text unit ${unit.textUnitId} generated prefix mismatch`);
    }
    if (spansOverlap(generated.sourceSpan, unit.sourceSpan)) {
      throw new Error(`Graph text unit ${unit.textUnitId} generated prefix overlaps raw evidence`);
    }
    if (generated.kind === "table-header") {
      if (!unit.table || !sameSpan(generated.sourceSpan, unit.table.headerSpan)) {
        throw new Error(`Graph text unit ${unit.textUnitId} has an invalid generated table header`);
      }
    } else if (
      !unit.list ||
      !unit.list.itemParts.some((part) => sameSpan(part.markerSpan, generated.sourceSpan))
    ) {
      throw new Error(`Graph text unit ${unit.textUnitId} has an invalid generated list marker`);
    }
    prefixLength = generated.localSpan.end;
  }
  return prefixLength;
}

function assertSpanInBounds(span: GraphSourceSpan, length: number, name: string): void {
  if (
    !Number.isInteger(span.start) ||
    !Number.isInteger(span.end) ||
    span.start < 0 ||
    span.end < span.start ||
    span.end > length
  ) {
    throw new Error(`Invalid ${name} span [${span.start}, ${span.end}) for length ${length}`);
  }
}

function assertContained(inner: GraphSourceSpan, outer: GraphSourceSpan, name: string): void {
  if (inner.start < outer.start || inner.end > outer.end) {
    throw new Error(
      `Invalid ${name} span: [${inner.start}, ${inner.end}) is not inside [${outer.start}, ${outer.end})`,
    );
  }
}

function spansOverlap(left: GraphSourceSpan, right: GraphSourceSpan): boolean {
  return left.start < right.end && right.start < left.end;
}

function sameSpan(left: GraphSourceSpan, right: GraphSourceSpan): boolean {
  return left.start === right.start && left.end === right.end;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function splitSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  const previous = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
