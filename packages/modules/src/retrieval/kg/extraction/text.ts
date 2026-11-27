import { createHash } from "node:crypto";
import { graphEvidenceSpan } from "../../graph-chunk-validation";
import type { GraphTextUnit } from "../../graph-chunk-types";
import { foldKgText } from "../normalize";
import type { MentionKind } from "./mention-kinds";
import type {
  ExtractionDiagnostic,
  MentionCandidateRecord,
  MentionLexiconMatch,
  MentionMethod,
  TextExtractionInput,
  TextExtractionResult,
  TextMentionEvidence,
  MatchQuality,
} from "./types";

interface PatternRule {
  readonly id: string;
  readonly candidateKind: MentionKind;
  readonly regex: RegExp;
  readonly sectionCodes?: readonly string[];
  readonly attributes?: Readonly<Record<string, unknown>>;
}

const PATTERN_RULES: readonly PatternRule[] = [
  {
    id: "atc-code",
    candidateKind: "identifier_atc",
    regex: /\b[A-V]\d{2}[A-Z]{2}\d{2}\b/gu,
    attributes: { scheme: "ATC" },
  },
  {
    id: "registration-number",
    candidateKind: "identifier_registration",
    regex: /\b\d{2,4}\s*\/\s*\d{2}\s*[A-Z]\s*\d{3}\s*\/\s*\d{2,4}\b/gu,
    attributes: { jurisdiction: "DZ" },
  },
  {
    id: "ndc",
    candidateKind: "identifier_ndc",
    regex: /\bNDC[:\s]*\d{4,5}-\d{3,4}(?:-\d{1,2})?\b/giu,
    attributes: { scheme: "NDC" },
  },
  {
    id: "unii",
    candidateKind: "identifier_unii",
    regex: /\bUNII[:\s]*[A-Z0-9]{10}\b/gu,
    attributes: { scheme: "UNII" },
  },
  {
    id: "cis",
    candidateKind: "identifier_cis",
    regex: /\bCIS[:\s]*\d{8}\b/giu,
    attributes: { scheme: "BDPM_CIS" },
  },
  {
    id: "quantity",
    candidateKind: "quantity",
    regex: /\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|ml|mL|UI|IU|%)\b/gu,
    attributes: { valueRole: "unscoped_quantity" },
  },
  {
    id: "dose-amount",
    candidateKind: "dose_amount",
    regex: /\b\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|ml|mL|UI|IU|%)\b/gu,
    sectionCodes: ["dosage", "overdose"],
    attributes: { valueRole: "dose_amount", sectionScoped: true },
  },
  {
    id: "package",
    candidateKind: "package_presentation",
    regex: /\bB\/\d+(?:\s*(?:ET|et)\s*B\/\d+)?/gu,
  },
  {
    id: "date-iso",
    candidateKind: "date",
    regex: /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/gu,
  },
  {
    id: "date-fr",
    candidateKind: "date",
    regex: /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)?\d{2}\b/gu,
  },
  {
    id: "shelf-life",
    candidateKind: "shelf_life",
    regex:
      /\b(?:Durée de conservation|Duree de conservation|Shelf life|Stabilité|Stabilite|Stability)\b[^.;\n]{0,160}/giu,
  },
  {
    id: "storage-condition",
    candidateKind: "storage_condition",
    regex: /\b(?:Conserver|Store|Stocker)\b[^.;\n]{3,160}/giu,
  },
  {
    id: "product-characteristic",
    candidateKind: "product_characteristic",
    regex: /\b(?:Color|Colour|Shape|Size|Flavor|Flavour|Imprint Code)\b[^.;\n]{0,100}/giu,
  },
  {
    id: "marketing-category",
    candidateKind: "marketing_category",
    regex:
      /\b(?:HUMAN\s+OTC\s+DRUG|HUMAN\s+PRESCRIPTION\s+DRUG|PRESCRIPTION\s+DRUG|OTC\s+DRUG|export only)\b/giu,
  },
];

const CLINICAL_BULLET_SECTIONS: Readonly<Record<string, MentionKind>> = {
  indications: "clinical_condition",
  contraindications: "clinical_condition",
  adverse_effects: "adverse_effect",
  overdose: "overdose_effect",
};

const BULLET_LINE = /^[ \t]*[-*+][ \t]+(.+)$/gmu;

export function extractTextUnitMentions(input: TextExtractionInput): TextExtractionResult {
  const candidates: MentionCandidateRecord[] = [];
  const diagnostics: ExtractionDiagnostic[] = [];
  const seen = new Set<string>();
  const uniqueStart = input.unit.uniqueLocalSpan.start;
  const searchText = input.unit.content.slice(
    input.unit.uniqueLocalSpan.start,
    input.unit.uniqueLocalSpan.end,
  );

  const addCandidate = (
    candidateKind: MentionKind,
    start: number,
    end: number,
    surfaceText: string,
    method: MentionMethod,
    matchQuality: MatchQuality,
    attributes: Readonly<Record<string, unknown>>,
    family: MentionCandidateRecord["family"],
  ): void => {
    const span = trimSurfaceSpan(input.unit.content, start, end);
    if (!span) return;
    const key = `${candidateKind}\u0000${span.start}\u0000${span.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      const evidence = textEvidenceFor(
        input.unit,
        span.start,
        span.end,
        input.document.documentSnapshotId,
      );
      candidates.push({
        mentionId: mentionIdFor({
          textUnitId: input.unit.textUnitId,
          snapshotId: input.unit.documentSnapshotId,
          start: span.start,
          end: span.end,
          candidateKind,
          surfaceText: input.unit.content.slice(span.start, span.end),
        }),
        extractionRunId: input.extractionRunId,
        candidateKind,
        family,
        surfaceText: input.unit.content.slice(span.start, span.end),
        normalizedSurface: foldKgText(input.unit.content.slice(span.start, span.end)),
        language: input.document.language,
        script: scriptForText(surfaceText),
        evidence,
        document: input.document,
        method,
        matchQuality,
        ontologyVersion: input.ontologyVersion,
        attributes,
        observationState: "quarantined",
      });
    } catch (error) {
      diagnostics.push({
        code: "invalid_mention_span",
        severity: "warning",
        message: error instanceof Error ? error.message : String(error),
        artifactId: input.unit.artifactId,
        textUnitId: input.unit.textUnitId,
        sectionId: input.unit.sectionId,
        sourceSpan: span,
      });
    }
  };

  for (const match of input.lexicon.match(searchText)) {
    addLexiconMatch(addCandidate, match, uniqueStart);
  }

  for (const rule of PATTERN_RULES) {
    if (rule.sectionCodes && !rule.sectionCodes.includes(input.unit.sectionCode)) continue;
    rule.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.regex.exec(searchText)) !== null) {
      if (match[0].length === 0) {
        rule.regex.lastIndex += 1;
        continue;
      }
      addCandidate(
        rule.candidateKind,
        uniqueStart + match.index,
        uniqueStart + match.index + match[0].length,
        match[0],
        "regex",
        "pattern",
        {
          patternId: rule.id,
          sectionCode: input.unit.sectionCode,
          sectionHeading: input.unit.sectionHeading,
          ...rule.attributes,
        },
        familyForKind(rule.candidateKind),
      );
    }
  }

  const clinicalKind = CLINICAL_BULLET_SECTIONS[input.unit.sectionCode];
  if (clinicalKind) {
    BULLET_LINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BULLET_LINE.exec(searchText)) !== null) {
      const raw = match[1] ?? "";
      const leading = raw.length - raw.trimStart().length;
      const start = uniqueStart + match.index + match[0].indexOf(raw) + leading;
      const clean = raw.trim().replace(/[.;:,]+$/u, "");
      if (clean.length < 3 || /DCI\s*:|\bTitulaire\s*:/iu.test(clean)) continue;
      const capped = safeSlice(clean, 160);
      addCandidate(
        clinicalKind,
        start,
        start + capped.length,
        capped,
        "cue",
        "cue",
        {
          cue: "list_bullet",
          sectionCode: input.unit.sectionCode,
          sectionHeading: input.unit.sectionHeading,
          assertionContext: input.unit.sectionCode,
        },
        "clinical",
      );
    }
  }

  if (input.unit.sectionCode === "excipients") {
    for (const span of excipientSpans(searchText)) {
      addCandidate(
        "excipient",
        uniqueStart + span.start,
        uniqueStart + span.end,
        searchText.slice(span.start, span.end),
        "cue",
        "cue",
        {
          cue: "excipient_list",
          sectionCode: input.unit.sectionCode,
          sectionHeading: input.unit.sectionHeading,
        },
        "product_regulatory",
      );
    }
  }

  return { candidates, diagnostics };
}

function addLexiconMatch(
  addCandidate: (
    candidateKind: MentionKind,
    start: number,
    end: number,
    surfaceText: string,
    method: MentionMethod,
    matchQuality: MatchQuality,
    attributes: Readonly<Record<string, unknown>>,
    family: MentionCandidateRecord["family"],
  ) => void,
  match: MentionLexiconMatch,
  offset: number,
): void {
  const sourceRefs = match.sourceRefs.slice(0, 20);
  addCandidate(
    match.candidateKind,
    offset + match.start,
    offset + match.end,
    match.surfaceText,
    "gazetteer",
    match.matchQuality,
    {
      ...match.attributes,
      lexiconSourceRefs: sourceRefs,
      lexiconSourceRefCount: match.sourceRefs.length,
      lexiconSourcesTruncated: match.sourceRefs.length > sourceRefs.length,
    },
    match.family,
  );
}

function textEvidenceFor(
  unit: GraphTextUnit,
  localStart: number,
  localEnd: number,
  snapshotId: string,
): TextMentionEvidence {
  const span = graphEvidenceSpan(unit, localStart, localEnd);
  if (span.documentSnapshotId !== snapshotId) {
    throw new Error(`Graph snapshot mismatch for ${unit.textUnitId}`);
  }
  return {
    kind: "text_span",
    textUnitId: unit.textUnitId,
    documentSnapshotId: unit.documentSnapshotId,
    artifactId: unit.artifactId,
    documentId: unit.documentId,
    sectionId: unit.sectionId,
    sectionCode: unit.sectionCode,
    sectionHeading: unit.sectionHeading,
    sectionPath: unit.sectionPath,
    offsetEncoding: span.offsetEncoding,
    localStart: span.start,
    localEnd: span.end,
    documentStart: span.documentStart,
    documentEnd: span.documentEnd,
    quote: span.quote,
    quoteSha256: span.quoteSha256,
    rawContentSha256: span.rawContentSha256,
  };
}

function trimSurfaceSpan(
  text: string,
  start: number,
  end: number,
): { readonly start: number; readonly end: number } | null {
  let from = start;
  let to = end;
  while (from < to && /\s/u.test(text[from]!)) from += 1;
  while (to > from && /[\s*_]+/u.test(text[to - 1]!)) to -= 1;
  return from < to ? { start: from, end: to } : null;
}

function mentionIdFor(input: {
  readonly textUnitId: string;
  readonly snapshotId: string;
  readonly start: number;
  readonly end: number;
  readonly candidateKind: string;
  readonly surfaceText: string;
}): string {
  const digest = sha256(
    [
      input.snapshotId,
      input.textUnitId,
      String(input.start),
      String(input.end),
      input.candidateKind,
      foldKgText(input.surfaceText),
    ].join("\u0000"),
  );
  return `men_${digest.slice(0, 32)}`;
}

function familyForKind(kind: MentionKind): MentionCandidateRecord["family"] {
  return kind.startsWith("identifier_") ||
    kind === "quantity" ||
    kind === "dose_amount" ||
    kind === "date" ||
    kind === "package_presentation" ||
    kind === "shelf_life" ||
    kind === "storage_condition" ||
    kind === "product_characteristic"
    ? "value"
    : "product_regulatory";
}

function excipientSpans(text: string): Array<{ readonly start: number; readonly end: number }> {
  const spans: Array<{ readonly start: number; readonly end: number }> = [];
  const separator = /[,;\n]+/gu;
  let start = 0;
  let match: RegExpExecArray | null;
  const push = (from: number, to: number) => {
    let first = from;
    let last = to;
    while (first < last && /[\s*_:-]/u.test(text[first]!)) first += 1;
    while (last > first && /[\s*_:-]/u.test(text[last - 1]!)) last -= 1;
    if (last - first >= 3 && last - first <= 120) spans.push({ start: first, end: last });
  };
  while ((match = separator.exec(text)) !== null) {
    push(start, match.index);
    start = match.index + match[0].length;
  }
  push(start, text.length);
  return spans;
}

function scriptForText(text: string): string {
  if (/\p{Script=Arabic}/u.test(text)) return "Arab";
  if (/\p{Script=Latin}/u.test(text)) return "Latn";
  return "Zyyy";
}

function safeSlice(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  let end = maxLength;
  const previous = value.charCodeAt(end - 1);
  const next = value.charCodeAt(end);
  if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
    end -= 1;
  }
  return value.slice(0, end);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
