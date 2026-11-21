/**
 * Source-authority policy.
 *
 * `authorityLevel` is a property of the source, not of the chunk text. It is
 * stored once in `retrieval_documents` / `retrieval_chunks` and returned with
 * every retrieved passage. It is deliberately *not* part of the embedded text:
 * a constant header per source would bias every vector toward that source and
 * would force a full re-embed whenever the policy changes.
 *
 * Lower wins. The per-source assignment lives in the collection lab's
 * `data/metadata/sources.csv`; this module owns only what each level means and
 * how conflicting passages are resolved.
 */

export interface AuthorityDescriptor {
  readonly level: number;
  readonly label: string;
  readonly official: boolean;
  readonly description: string;
}

const DESCRIPTORS: Readonly<Record<number, AuthorityDescriptor>> = {
  1: {
    level: 1,
    label: "Algerian official sources — ANPP and Ministry of Health",
    official: true,
    description:
      "Official Algerian SmPC or package leaflet published by the ANPP, and the official nomenclature published by the Ministry of Health. Highest priority.",
  },
  2: {
    level: 2,
    label: "Algerian nomenclature register (Pharm'Net)",
    official: false,
    description:
      "Public catalogue of the Algerian nomenclature: brand, DCI, registration number, holder and register status. A name/registration source; it hosts no leaflet and never overrides a level 1 clinical source.",
  },
  3: {
    level: 3,
    label: "Foreign institutional reference",
    official: false,
    description:
      "Foreign regulator or public database (BDPM/ANSM France, DailyMed US, EMA EU). Authoritative in its own jurisdiction, not for Algeria.",
  },
  4: {
    level: 4,
    label: "Secondary / non-official",
    official: false,
    description: "Algerian professional or secondary source. Never overrides an official source.",
  },
};

const UNKNOWN: AuthorityDescriptor = {
  level: 99,
  label: "Unknown authority",
  official: false,
  description: "The source has no registered authority level. Treat it as secondary.",
};

export function authorityDescriptor(level: number): AuthorityDescriptor {
  return DESCRIPTORS[level] ?? UNKNOWN;
}

export function authorityLabel(level: number): string {
  return authorityDescriptor(level).label;
}

export function isOfficialAuthority(level: number): boolean {
  return authorityDescriptor(level).official;
}

/** Lower level wins. Negative when `left` outranks `right`. */
export function compareAuthority(left: number, right: number): number {
  return left - right;
}

/**
 * Prompt-ready precedence. Keep this identical in the tool description and the
 * agent instructions; the model must never see two versions of the rule.
 */
export const AUTHORITY_PRECEDENCE =
  "Source authority, lower wins: 1 = ANPP SmPC/leaflet and Ministry of Health nomenclature " +
  "(official Algerian); 2 = Pharm'Net Algerian nomenclature register (names, registration " +
  "status); 3 = foreign institutional reference (BDPM/ANSM France, DailyMed US, EMA EU); " +
  "4 = secondary / non-official. " +
  "When two passages disagree on the same medicine and section, follow the lower number, " +
  "cite the source you followed, and state the discrepancy. Never let a level 3 or 4 " +
  "source override a level 1 or 2 source.";

export interface AuthorityOverlapInput {
  readonly chunkId: string;
  readonly medicineIds: readonly string[];
  /** Every section the chunk covers; packed chunks cover more than one. */
  readonly sectionCodes: readonly string[];
  readonly sourceId: string;
  readonly sourceName: string;
  readonly authorityLevel: number;
  /** Chunk body, used only for deterministic numeric evidence. */
  readonly content?: string;
}

/**
 * What a source is allowed to make a claim about.
 *
 * A nomenclature or register row states a registered name, strength and
 * status. It does not state an indication, a dose or a contraindication, so it
 * cannot contradict a leaflet on those topics even when both mention the same
 * medicine. Comparing them produced "conflicts" that were really two different
 * kinds of statement, so the scope is part of the conflict key.
 */
export type ClaimScope = "clinical" | "registration";

const SOURCE_CLAIM_SCOPE: Readonly<Record<string, ClaimScope>> = {
  ANPP_RCP: "clinical",
  ANPP_SITE: "clinical",
  BDPM_FR: "clinical",
  DAILYMED: "clinical",
  EMA: "clinical",
  SANTE_MSP: "registration",
  PHARMNET: "registration",
  PHARMNET_CATALOG: "registration",
};

/** Unknown sources are treated as clinical so a new leaflet is not ignored. */
export function claimScopeForSource(sourceId: string): ClaimScope {
  return SOURCE_CLAIM_SCOPE[sourceId] ?? "clinical";
}

export interface AuthorityOverlapEntry {
  readonly chunkId: string;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly authorityLevel: number;
  readonly authorityLabel: string;
  readonly claimScope: ClaimScope;
}

export interface AuthorityOverlap {
  /** Every medicine the conflicting passages share. */
  readonly medicineIds: readonly string[];
  /** Every section the conflicting passages share. */
  readonly sectionCodes: readonly string[];
  readonly claimScope: ClaimScope;
  readonly entries: readonly AuthorityOverlapEntry[];
  readonly preferredChunkId: string;
  readonly preferredAuthorityLevel: number;
  /** Difference between the lowest and highest authority level in the group. */
  readonly authorityGap: number;
  /**
   * Canonical numbers (`500 mg`, `2 fois`) that appear on one side and not the
   * other, restricted to units both sides use. Empty with `numbersCompared`
   * true means the passages agree on every comparable number; empty with it
   * false means no comparison was possible or the scope is a register list.
   */
  readonly numericDivergence: readonly string[];
  /** True when at least two clinical passages carried comparable numbers. */
  readonly numbersCompared: boolean;
}

/** Keep the hint short; a 12-chunk result set cannot produce more than this. */
const MAX_OVERLAPS = 8;

/** `other` is the catch-all bucket, not a claim two sources can share. */
const NON_CLAIM_SECTIONS: ReadonlySet<string> = new Set(["", "other"]);

const NUMBER_UNIT =
  /(\d+(?:[.,]\d+)?)\s*(mg|g|µg|mcg|ml|cl|l|%|heures?|jours?|semaines?|mois|fois|ans?|années?)/gi;

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  heure: "h",
  heures: "h",
  jour: "j",
  jours: "j",
  semaine: "sem",
  semaines: "sem",
  an: "an",
  ans: "an",
  année: "an",
  années: "an",
  mcg: "µg",
};

function canonicalNumber(value: string, unit: string): string {
  const numeric = Number(value.replace(",", "."));
  const text = Number.isFinite(numeric) ? String(numeric) : value.replace(",", ".");
  const lower = unit.toLowerCase();
  return `${text} ${UNIT_ALIASES[lower] ?? lower}`;
}

/** Canonical `value unit` tokens; unitless counts are ignored. */
export function numericClaims(text: string | undefined): Set<string> {
  const claims = new Set<string>();
  if (!text) return claims;
  for (const match of text.matchAll(NUMBER_UNIT)) {
    const value = match[1];
    const unit = match[2];
    if (!value || !unit) continue;
    claims.add(canonicalNumber(value, unit));
  }
  return claims;
}

function divergence(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] {
  const byUnit = (claims: ReadonlySet<string>) => {
    const map = new Map<string, Set<string>>();
    for (const claim of claims) {
      const [value, unit] = claim.split(" ");
      const values = map.get(unit) ?? new Set<string>();
      values.add(value);
      map.set(unit, values);
    }
    return map;
  };
  const leftUnits = byUnit(left);
  const rightUnits = byUnit(right);
  const differing = new Set<string>();
  for (const [unit, leftValues] of leftUnits) {
    const rightValues = rightUnits.get(unit);
    if (!rightValues) continue;
    const same =
      leftValues.size === rightValues.size &&
      [...leftValues].every((value) => rightValues.has(value));
    if (same) continue;
    for (const value of leftValues) differing.add(`${value} ${unit}`);
    for (const value of rightValues) differing.add(`${value} ${unit}`);
  }
  return [...differing].sort((a, b) => a.localeCompare(b));
}

function claimSections(sectionCodes: readonly string[]): string[] {
  return [...new Set(sectionCodes.filter((code) => !NON_CLAIM_SECTIONS.has(code)))];
}

/**
 * Report passages that make a comparable claim about the same medicine and
 * section from sources of different authority.
 *
 * Three conditions are required, because co-occurrence alone is not a
 * disagreement: the passages share a medicine, they share a section that is a
 * real claim (`other` excluded), and they speak in the same claim scope. The
 * numeric evidence is reported separately so the model can tell a measured
 * divergence from a wording difference, and it is only computed for clinical
 * prose: a register chunk lists many products, so its numbers are not one
 * claim. This is a deterministic hint, not a ranking change: the model sees
 * both passages and applies the precedence rule.
 */
export function findAuthorityOverlaps(
  chunks: readonly AuthorityOverlapInput[],
): AuthorityOverlap[] {
  const groups = new Map<string, AuthorityOverlapInput[]>();
  for (const chunk of chunks) {
    if (chunk.medicineIds.length === 0) continue;
    const sections = claimSections(chunk.sectionCodes);
    if (sections.length === 0) continue;
    for (const medicineId of new Set(chunk.medicineIds)) {
      for (const sectionCode of sections) {
        const key = `${medicineId}\u0000${sectionCode}`;
        const group = groups.get(key);
        if (group) group.push(chunk);
        else groups.set(key, [chunk]);
      }
    }
  }

  const merged = new Map<string, AuthorityOverlap>();
  for (const group of groups.values()) {
    const byChunk = new Map<string, AuthorityOverlapInput>();
    for (const chunk of group) byChunk.set(chunk.chunkId, chunk);
    const entries = [...byChunk.values()];

    const byScope = new Map<ClaimScope, AuthorityOverlapInput[]>();
    for (const entry of entries) {
      const scope = claimScopeForSource(entry.sourceId);
      const scoped = byScope.get(scope) ?? [];
      scoped.push(entry);
      byScope.set(scope, scoped);
    }

    for (const [scope, scoped] of byScope) {
      if (scoped.length < 2) continue;
      const levels = new Set(scoped.map((entry) => entry.authorityLevel));
      if (levels.size < 2) continue;

      const preferred = scoped.reduce((best, entry) =>
        compareAuthority(entry.authorityLevel, best.authorityLevel) < 0 ? entry : best,
      );
      const differing = new Set<string>();
      let numbersCompared = false;
      // A register chunk is a list of products, not one claim: comparing the
      // union of every strength in two lists says nothing about either row.
      // Register reconciliation compares names and statuses, not numbers.
      if (scope === "clinical") {
        const preferredClaims = numericClaims(preferred.content);
        for (const entry of scoped) {
          if (entry.chunkId === preferred.chunkId) continue;
          const claims = numericClaims(entry.content);
          if (claims.size === 0 || preferredClaims.size === 0) continue;
          numbersCompared = true;
          for (const value of divergence(preferredClaims, claims)) differing.add(value);
        }
      }

      const signature = scoped
        .map((entry) => entry.chunkId)
        .sort()
        .join("\u0000");
      const existing = merged.get(signature);
      const sectionCodes = new Set(scoped.flatMap((entry) => entry.sectionCodes));
      const medicineIds = new Set(scoped.flatMap((entry) => entry.medicineIds));
      const authorityGap = Math.max(...levels) - Math.min(...levels);

      if (existing) {
        merged.set(signature, {
          ...existing,
          medicineIds: [...new Set([...existing.medicineIds, ...medicineIds])].sort(),
          sectionCodes: [...new Set([...existing.sectionCodes, ...sectionCodes])].sort(),
          authorityGap: Math.max(existing.authorityGap, authorityGap),
          numericDivergence: [...new Set([...existing.numericDivergence, ...differing])].sort(
            (a, b) => a.localeCompare(b),
          ),
          numbersCompared: existing.numbersCompared || numbersCompared,
        });
        continue;
      }

      merged.set(signature, {
        medicineIds: [...medicineIds].sort(),
        sectionCodes: [...sectionCodes].sort(),
        claimScope: scope,
        entries: scoped.map((entry) => ({
          chunkId: entry.chunkId,
          sourceId: entry.sourceId,
          sourceName: entry.sourceName,
          authorityLevel: entry.authorityLevel,
          authorityLabel: authorityLabel(entry.authorityLevel),
          claimScope: scope,
        })),
        preferredChunkId: preferred.chunkId,
        preferredAuthorityLevel: preferred.authorityLevel,
        authorityGap,
        numericDivergence: [...differing].sort((a, b) => a.localeCompare(b)),
        numbersCompared,
      });
    }
  }

  return [...merged.values()]
    .sort(
      (left, right) =>
        Number(right.numericDivergence.length > 0) - Number(left.numericDivergence.length > 0) ||
        left.preferredAuthorityLevel - right.preferredAuthorityLevel ||
        right.authorityGap - left.authorityGap ||
        right.entries.length - left.entries.length ||
        left.preferredChunkId.localeCompare(right.preferredChunkId),
    )
    .slice(0, MAX_OVERLAPS);
}
