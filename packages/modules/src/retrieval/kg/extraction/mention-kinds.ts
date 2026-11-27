/**
 * Temporary entity-mention taxonomy for candidate extraction.
 *
 * This is deliberately broader than the current KG entity enum because the
 * corpus exposes product, regulatory, clinical, identifier, and value mentions
 * that are not all graph nodes. `Person 1` must review the node/value/role
 * classification before a canonical ontology or linking phase is implemented.
 */

export const ENTITY_MENTION_TAXONOMY_VERSION = "entity-mention-taxonomy-v0.1" as const;

export type MentionFamily = "evidence" | "product_regulatory" | "clinical" | "value";

export type MentionStorageClass =
  | "evidence_ref"
  | "node_candidate"
  | "controlled_value"
  | "role_value"
  | "value_candidate";

export interface MentionKindDefinition {
  readonly candidateKind: string;
  readonly family: MentionFamily;
  readonly storageClass: MentionStorageClass;
  readonly description: string;
  /** Recognition priority; higher wins when different spans overlap. */
  readonly priority: number;
}

export const MENTION_KIND_DEFINITIONS = [
  {
    candidateKind: "source",
    family: "evidence",
    storageClass: "evidence_ref",
    description: "Publisher/agency registry entry.",
    priority: 20,
  },
  {
    candidateKind: "document",
    family: "evidence",
    storageClass: "evidence_ref",
    description: "Clean document artifact.",
    priority: 20,
  },
  {
    candidateKind: "document_section",
    family: "evidence",
    storageClass: "evidence_ref",
    description: "Heading-delimited document section.",
    priority: 20,
  },
  {
    candidateKind: "document_type",
    family: "evidence",
    storageClass: "controlled_value",
    description: "RCP, notice, label, nomenclature, or other document type.",
    priority: 30,
  },
  {
    candidateKind: "language",
    family: "evidence",
    storageClass: "controlled_value",
    description: "Source language.",
    priority: 30,
  },
  {
    candidateKind: "jurisdiction",
    family: "evidence",
    storageClass: "controlled_value",
    description: "Country or regulatory jurisdiction.",
    priority: 35,
  },
  {
    candidateKind: "source_type",
    family: "evidence",
    storageClass: "controlled_value",
    description: "Official agency, ministry, professional, or foreign institutional source type.",
    priority: 30,
  },
  {
    candidateKind: "medicinal_product",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Named/marketed medicinal product from a source.",
    priority: 100,
  },
  {
    candidateKind: "brand_term",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Brand or trade name mention; identity is resolved later.",
    priority: 95,
  },
  {
    candidateKind: "pharmaceutical_product",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Formulation/strength/form representation of a product.",
    priority: 90,
  },
  {
    candidateKind: "product_package",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Packaged presentation.",
    priority: 85,
  },
  {
    candidateKind: "substance",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Active substance, salt, hydrate, or combination component.",
    priority: 88,
  },
  {
    candidateKind: "excipient",
    family: "product_regulatory",
    storageClass: "role_value",
    description: "Substance mentioned in an excipient role.",
    priority: 70,
  },
  {
    candidateKind: "dose_form",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Pharmaceutical dose form.",
    priority: 65,
  },
  {
    candidateKind: "strength",
    family: "product_regulatory",
    storageClass: "value_candidate",
    description: "Strength expression attached to a product or substance.",
    priority: 40,
  },
  {
    candidateKind: "route_of_administration",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Explicit route of administration.",
    priority: 60,
  },
  {
    candidateKind: "therapeutic_class",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Source or ATC therapeutic class label.",
    priority: 55,
  },
  {
    candidateKind: "atc_class",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "ATC classification code or family.",
    priority: 60,
  },
  {
    candidateKind: "product_type",
    family: "product_regulatory",
    storageClass: "controlled_value",
    description: "GE, RE, BIO, or another source product type.",
    priority: 45,
  },
  {
    candidateKind: "marketing_category",
    family: "product_regulatory",
    storageClass: "controlled_value",
    description: "OTC, prescription, export-only, or equivalent category.",
    priority: 40,
  },
  {
    candidateKind: "regulatory_status",
    family: "product_regulatory",
    storageClass: "controlled_value",
    description: "Source-stated authorization/registration status.",
    priority: 45,
  },
  {
    candidateKind: "marketing_status",
    family: "product_regulatory",
    storageClass: "controlled_value",
    description: "Commercialized / not commercialized status.",
    priority: 40,
  },
  {
    candidateKind: "schedule",
    family: "product_regulatory",
    storageClass: "controlled_value",
    description: "Dispensing schedule such as Liste I/II or stupéfiant.",
    priority: 45,
  },
  {
    candidateKind: "regulatory_procedure",
    family: "product_regulatory",
    storageClass: "controlled_value",
    description: "National, decentralized, mutual-recognition, or centralized procedure.",
    priority: 40,
  },
  {
    candidateKind: "regulatory_authorization",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Registration or marketing-authorization record.",
    priority: 75,
  },
  {
    candidateKind: "regulatory_authority",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Authority organization such as ANPP, Ministry, FDA, or EMA.",
    priority: 70,
  },
  {
    candidateKind: "organization",
    family: "product_regulatory",
    storageClass: "node_candidate",
    description: "Holder, manufacturer, labeler, distributor, or other organization.",
    priority: 72,
  },
  {
    candidateKind: "clinical_condition",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Disease, disorder, indication, or clinical condition mention.",
    priority: 50,
  },
  {
    candidateKind: "symptom",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Source-stated symptom.",
    priority: 50,
  },
  {
    candidateKind: "adverse_effect",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Source-stated adverse effect or reaction.",
    priority: 50,
  },
  {
    candidateKind: "overdose_effect",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Source-stated overdose effect or toxicity manifestation.",
    priority: 50,
  },
  {
    candidateKind: "clinical_finding",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Finding, sign, or assessment result.",
    priority: 50,
  },
  {
    candidateKind: "medical_procedure",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Dialysis, surgery, transfusion, or other procedure.",
    priority: 50,
  },
  {
    candidateKind: "laboratory_test",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Named laboratory test.",
    priority: 50,
  },
  {
    candidateKind: "monitoring_parameter",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Clinical parameter requiring monitoring.",
    priority: 50,
  },
  {
    candidateKind: "biological_target",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Enzyme, receptor, or other biological target.",
    priority: 50,
  },
  {
    candidateKind: "population_group",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Age, pregnancy, lactation, renal/hepatic, or other population.",
    priority: 55,
  },
  {
    candidateKind: "food_or_beverage",
    family: "clinical",
    storageClass: "node_candidate",
    description: "Food/beverage interaction participant such as alcohol or grapefruit.",
    priority: 50,
  },
  {
    candidateKind: "identifier_registration",
    family: "value",
    storageClass: "value_candidate",
    description: "Registration or marketing-authorization number.",
    priority: 45,
  },
  {
    candidateKind: "identifier_cis",
    family: "value",
    storageClass: "value_candidate",
    description: "BDPM CIS identifier.",
    priority: 45,
  },
  {
    candidateKind: "identifier_ndc",
    family: "value",
    storageClass: "value_candidate",
    description: "US NDC identifier.",
    priority: 45,
  },
  {
    candidateKind: "identifier_unii",
    family: "value",
    storageClass: "value_candidate",
    description: "FDA UNII identifier.",
    priority: 45,
  },
  {
    candidateKind: "identifier_dci",
    family: "value",
    storageClass: "value_candidate",
    description: "Local DCI code.",
    priority: 40,
  },
  {
    candidateKind: "identifier_atc",
    family: "value",
    storageClass: "value_candidate",
    description: "ATC code in identifier position.",
    priority: 40,
  },
  {
    candidateKind: "quantity",
    family: "value",
    storageClass: "value_candidate",
    description: "Strength, dose, or other quantity expression.",
    priority: 40,
  },
  {
    candidateKind: "dose_amount",
    family: "value",
    storageClass: "value_candidate",
    description: "Dose amount with unit.",
    priority: 40,
  },
  {
    candidateKind: "date",
    family: "value",
    storageClass: "value_candidate",
    description: "Source-stated date.",
    priority: 35,
  },
  {
    candidateKind: "package_presentation",
    family: "value",
    storageClass: "value_candidate",
    description: "Package text such as B/20 or carton/bottle counts.",
    priority: 40,
  },
  {
    candidateKind: "shelf_life",
    family: "value",
    storageClass: "value_candidate",
    description: "Shelf-life or stability duration.",
    priority: 40,
  },
  {
    candidateKind: "storage_condition",
    family: "value",
    storageClass: "value_candidate",
    description: "Source-stated storage condition.",
    priority: 40,
  },
  {
    candidateKind: "product_characteristic",
    family: "value",
    storageClass: "value_candidate",
    description: "Color, shape, size, flavor, or imprint characteristic.",
    priority: 35,
  },
] as const satisfies readonly MentionKindDefinition[];

export type MentionKind = (typeof MENTION_KIND_DEFINITIONS)[number]["candidateKind"];

export const MENTION_KINDS: readonly MentionKind[] = MENTION_KIND_DEFINITIONS.map(
  (definition) => definition.candidateKind,
);

const BY_KIND = new Map<string, MentionKindDefinition>(
  MENTION_KIND_DEFINITIONS.map((definition) => [definition.candidateKind, definition]),
);

export function mentionKindDefinition(kind: string): MentionKindDefinition {
  const definition = BY_KIND.get(kind);
  if (!definition) throw new Error(`Unknown entity mention kind: ${kind}`);
  return definition;
}

export function isMentionKind(value: string): value is MentionKind {
  return BY_KIND.has(value);
}
