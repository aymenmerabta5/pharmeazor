import type { MentionKind } from "./mention-kinds";

/**
 * Temporary candidate relationship taxonomy.
 *
 * Relationships are derived only from explicit structured columns or from
 * section-gated text rules. They never resolve mentions to canonical entities
 * and they are not clinical assertions. Person 1 must review the endpoint and
 * qualifier semantics before this taxonomy is used for canonicalization.
 */
export const RELATIONSHIP_TAXONOMY_VERSION = "relationship-candidate-taxonomy-v0.1" as const;

export type RelationshipFamily = "evidence" | "product_regulatory" | "clinical";
export type RelationshipExtractionMode = "structured_row" | "text";
export type RelationshipScope = "clause" | "unit";

export interface RelationshipKindDefinition {
  readonly relationshipKind: string;
  readonly family: RelationshipFamily;
  readonly description: string;
  readonly subjectKinds: readonly MentionKind[];
  readonly objectKinds: readonly MentionKind[];
  readonly modes: readonly RelationshipExtractionMode[];
  readonly sectionCodes?: readonly string[];
  readonly scope?: RelationshipScope;
  /** Serialized JavaScript regular expression source; never a model prompt. */
  readonly cuePattern?: string;
  readonly priority: number;
}

const PRODUCT_KINDS = [
  "medicinal_product",
  "pharmaceutical_product",
  "brand_term",
] as const satisfies readonly MentionKind[];

const RELATIONSHIP_DEFINITIONS_RAW = [
  {
    relationshipKind: "product_has_substance",
    family: "product_regulatory",
    description: "A product row or composition statement names an active substance.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["substance"],
    modes: ["structured_row", "text"],
    sectionCodes: ["composition"],
    scope: "unit",
    priority: 100,
  },
  {
    relationshipKind: "product_has_dose_form",
    family: "product_regulatory",
    description: "A product row or denomination statement names a dose form.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["dose_form"],
    modes: ["structured_row", "text"],
    sectionCodes: ["denomination"],
    scope: "unit",
    priority: 95,
  },
  {
    relationshipKind: "product_has_strength",
    family: "product_regulatory",
    description: "A product row or text statement gives a strength.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["strength"],
    modes: ["structured_row", "text"],
    sectionCodes: ["denomination", "composition", "dosage"],
    scope: "clause",
    priority: 90,
  },
  {
    relationshipKind: "product_has_package",
    family: "product_regulatory",
    description: "A product row gives a package presentation.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["package_presentation", "product_package"],
    modes: ["structured_row"],
    priority: 85,
  },
  {
    relationshipKind: "product_has_route",
    family: "product_regulatory",
    description: "A product row or administration statement gives a route of administration.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["route_of_administration"],
    modes: ["structured_row", "text"],
    sectionCodes: ["dosage"],
    scope: "clause",
    priority: 82,
  },
  {
    relationshipKind: "product_has_atc_class",
    family: "product_regulatory",
    description: "A product row or an ATC-labelled text statement gives an ATC class.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["atc_class", "identifier_atc"],
    modes: ["structured_row", "text"],
    sectionCodes: ["pharmacodynamics", "pharmacology", "denomination", "other"],
    scope: "clause",
    cuePattern: "\\bATC\\b|classification\\s+ATC",
    priority: 80,
  },
  {
    relationshipKind: "product_has_therapeutic_class",
    family: "product_regulatory",
    description: "A product row gives a therapeutic class label.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["therapeutic_class"],
    modes: ["structured_row"],
    priority: 78,
  },
  {
    relationshipKind: "product_has_schedule",
    family: "product_regulatory",
    description: "A product row gives a dispensing schedule.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["schedule"],
    modes: ["structured_row"],
    priority: 76,
  },
  {
    relationshipKind: "product_has_product_type",
    family: "product_regulatory",
    description: "A product row gives a source product type such as GE or RE.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["product_type"],
    modes: ["structured_row"],
    priority: 74,
  },
  {
    relationshipKind: "product_has_regulatory_status",
    family: "product_regulatory",
    description: "A product row gives a source-stated regulatory status.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["regulatory_status"],
    modes: ["structured_row"],
    priority: 72,
  },
  {
    relationshipKind: "product_has_marketing_status",
    family: "product_regulatory",
    description: "A product row gives a source-stated marketing status.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["marketing_status"],
    modes: ["structured_row"],
    priority: 70,
  },
  {
    relationshipKind: "product_has_regulatory_procedure",
    family: "product_regulatory",
    description: "A product row gives a source-stated regulatory procedure.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["regulatory_procedure"],
    modes: ["structured_row"],
    priority: 68,
  },
  {
    relationshipKind: "product_has_shelf_life",
    family: "product_regulatory",
    description: "A product row or storage statement gives a shelf life.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["shelf_life"],
    modes: ["structured_row", "text"],
    sectionCodes: ["storage", "pharmaceutical_data", "other"],
    scope: "clause",
    priority: 66,
  },
  {
    relationshipKind: "product_held_by_organization",
    family: "product_regulatory",
    description: "A product row or holder statement names an organization.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["organization"],
    modes: ["structured_row", "text"],
    sectionCodes: ["administrative", "other", "denomination"],
    scope: "clause",
    cuePattern: "titulaire|holder|exploitant",
    priority: 64,
  },
  {
    relationshipKind: "product_has_authorization",
    family: "product_regulatory",
    description:
      "A product row or registration statement gives an authorization record or identifier.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["regulatory_authorization", "identifier_registration", "identifier_cis"],
    modes: ["structured_row", "text"],
    sectionCodes: ["administrative", "other", "denomination"],
    scope: "clause",
    cuePattern: "enregistrement|registration|autorisation de mise sur le march|\\bAMM\\b|\\bCIS\\b",
    priority: 62,
  },
  {
    relationshipKind: "authorization_held_by_organization",
    family: "product_regulatory",
    description: "An authorization row names an organization holder.",
    subjectKinds: ["regulatory_authorization"],
    objectKinds: ["organization"],
    modes: ["structured_row"],
    priority: 60,
  },
  {
    relationshipKind: "product_indicated_for_condition",
    family: "clinical",
    description: "A product and a condition occur in the same indications text unit.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["clinical_condition"],
    modes: ["text"],
    sectionCodes: ["indications"],
    scope: "unit",
    priority: 55,
  },
  {
    relationshipKind: "product_contraindicated_for_condition",
    family: "clinical",
    description: "A product and a condition occur in the same contraindications text unit.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["clinical_condition"],
    modes: ["text"],
    sectionCodes: ["contraindications"],
    scope: "unit",
    priority: 54,
  },
  {
    relationshipKind: "product_has_adverse_effect",
    family: "clinical",
    description: "A product and an adverse effect occur in the same adverse-effects text unit.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["adverse_effect"],
    modes: ["text"],
    sectionCodes: ["adverse_effects"],
    scope: "unit",
    priority: 53,
  },
  {
    relationshipKind: "product_has_overdose_effect",
    family: "clinical",
    description: "A product and an overdose effect occur in the same overdose text unit.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["overdose_effect"],
    modes: ["text"],
    sectionCodes: ["overdose"],
    scope: "unit",
    priority: 52,
  },
  {
    relationshipKind: "product_has_excipient",
    family: "product_regulatory",
    description: "A product and an excipient occur in the same excipients text unit.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["excipient"],
    modes: ["text"],
    sectionCodes: ["excipients"],
    scope: "unit",
    priority: 51,
  },
  {
    relationshipKind: "product_targets_population",
    family: "clinical",
    description: "A product and a population occur in the same explicit clause.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["population_group"],
    modes: ["text"],
    sectionCodes: ["indications", "dosage", "contraindications", "pregnancy", "warnings"],
    scope: "clause",
    priority: 50,
  },
  {
    relationshipKind: "product_has_storage_condition",
    family: "product_regulatory",
    description: "A product and a storage condition occur in the same explicit clause.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["storage_condition"],
    modes: ["text"],
    sectionCodes: ["storage", "pharmaceutical_data", "other"],
    scope: "clause",
    priority: 48,
  },
  {
    relationshipKind: "product_has_product_characteristic",
    family: "product_regulatory",
    description: "A product and a color, shape, size, flavor, or imprint occur in the same clause.",
    subjectKinds: PRODUCT_KINDS,
    objectKinds: ["product_characteristic"],
    modes: ["text"],
    sectionCodes: ["other", "denomination"],
    scope: "clause",
    priority: 46,
  },
  {
    relationshipKind: "source_has_jurisdiction",
    family: "evidence",
    description: "A source registry row gives a jurisdiction.",
    subjectKinds: ["source"],
    objectKinds: ["jurisdiction"],
    modes: ["structured_row"],
    priority: 40,
  },
  {
    relationshipKind: "source_has_language",
    family: "evidence",
    description: "A source registry row gives a language.",
    subjectKinds: ["source"],
    objectKinds: ["language"],
    modes: ["structured_row"],
    priority: 39,
  },
  {
    relationshipKind: "source_has_type",
    family: "evidence",
    description: "A source registry row gives a source type.",
    subjectKinds: ["source"],
    objectKinds: ["source_type"],
    modes: ["structured_row"],
    priority: 38,
  },
] as const satisfies readonly RelationshipKindDefinition[];

export type RelationshipKind = (typeof RELATIONSHIP_DEFINITIONS_RAW)[number]["relationshipKind"];

export const RELATIONSHIP_KIND_DEFINITIONS: readonly RelationshipKindDefinition[] =
  RELATIONSHIP_DEFINITIONS_RAW;

export const RELATIONSHIP_KINDS: readonly RelationshipKind[] = RELATIONSHIP_DEFINITIONS_RAW.map(
  (definition) => definition.relationshipKind,
);

const BY_KIND = new Map<string, RelationshipKindDefinition>(
  RELATIONSHIP_KIND_DEFINITIONS.map((definition) => [definition.relationshipKind, definition]),
);

export function relationshipKindDefinition(relationshipKind: string): RelationshipKindDefinition {
  const definition = BY_KIND.get(relationshipKind);
  if (!definition) throw new Error(`Unknown relationship candidate kind: ${relationshipKind}`);
  return definition;
}
