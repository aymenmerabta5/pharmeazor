import type { MentionKind } from "./mention-kinds";

/**
 * Temporary candidate entity-linking taxonomy.
 *
 * Linking groups are deliberately narrower than the mention taxonomy. Values,
 * identifiers, quantities, evidence references, and role values are not turned
 * into candidate entities. Person 1 must review this grouping before any
 * resolved/canonical entity, database, or graph publication work.
 */
export const ENTITY_LINK_TAXONOMY_VERSION = "entity-link-candidate-taxonomy-v0.1" as const;

export type LinkGroup =
  | "product"
  | "substance"
  | "excipient"
  | "organization"
  | "clinical"
  | "food_or_beverage"
  | "population"
  | "dose_form"
  | "route"
  | "therapeutic_class";

export interface LinkGroupDefinition {
  readonly group: LinkGroup;
  readonly description: string;
  readonly identityPolicy: string;
  readonly memberKinds: readonly MentionKind[];
  /** Context dimensions that must not conflict inside one candidate cluster. */
  readonly conflictContexts: readonly string[];
}

export const LINK_GROUP_DEFINITIONS = [
  {
    group: "product",
    description: "Marketed product, brand, or pharmaceutical formulation candidate.",
    identityPolicy:
      "Prefer a shared strong identifier. Otherwise require the same brand key and compatible form/strength/holder/source context.",
    memberKinds: ["medicinal_product", "brand_term", "pharmaceutical_product"],
    conflictContexts: [
      "source",
      "jurisdiction",
      "form",
      "strength",
      "holder",
      "product_type",
      "schedule",
    ],
  },
  {
    group: "substance",
    description: "Active substance or ingredient candidate.",
    identityPolicy:
      "Use the exact normalized substance name; keep salt/hydrate variants separate and flag base-name overlap as ambiguous.",
    memberKinds: ["substance"],
    conflictContexts: [],
  },
  {
    group: "excipient",
    description: "Excipient role candidate.",
    identityPolicy:
      "Use the exact normalized excipient name inside the excipient role; never merge it with an active substance.",
    memberKinds: ["excipient"],
    conflictContexts: [],
  },
  {
    group: "organization",
    description: "Holder, manufacturer, distributor, or regulatory-authority candidate.",
    identityPolicy:
      "Use the normalized organization key plus jurisdiction/source context; do not merge different legal roles without review.",
    memberKinds: ["organization", "regulatory_authority"],
    conflictContexts: ["jurisdiction", "source"],
  },
  {
    group: "clinical",
    description:
      "Clinical condition, symptom, effect, finding, procedure, test, or target candidate.",
    identityPolicy:
      "Use the exact normalized clinical label and keep different clinical roles or languages separate as ambiguous.",
    memberKinds: [
      "clinical_condition",
      "symptom",
      "adverse_effect",
      "overdose_effect",
      "clinical_finding",
      "medical_procedure",
      "laboratory_test",
      "monitoring_parameter",
      "biological_target",
    ],
    conflictContexts: ["language"],
  },
  {
    group: "food_or_beverage",
    description: "Food or beverage interactant candidate.",
    identityPolicy: "Use the exact normalized label.",
    memberKinds: ["food_or_beverage"],
    conflictContexts: ["language"],
  },
  {
    group: "population",
    description: "Age, pregnancy, lactation, renal/hepatic, or other population candidate.",
    identityPolicy: "Use the exact normalized population label and language.",
    memberKinds: ["population_group"],
    conflictContexts: ["language"],
  },
  {
    group: "dose_form",
    description: "Pharmaceutical dose-form candidate.",
    identityPolicy: "Use the normalized dose-form key.",
    memberKinds: ["dose_form"],
    conflictContexts: [],
  },
  {
    group: "route",
    description: "Route-of-administration candidate.",
    identityPolicy: "Use the exact normalized route label.",
    memberKinds: ["route_of_administration"],
    conflictContexts: [],
  },
  {
    group: "therapeutic_class",
    description: "Therapeutic or ATC classification candidate.",
    identityPolicy:
      "Use the exact normalized class/code. A class code is classification evidence, never a product identity key.",
    memberKinds: ["therapeutic_class", "atc_class"],
    conflictContexts: [],
  },
] as const satisfies readonly LinkGroupDefinition[];

export const LINK_GROUPS: readonly LinkGroup[] = LINK_GROUP_DEFINITIONS.map(
  (definition) => definition.group,
);

const BY_KIND = new Map<string, LinkGroupDefinition>();
for (const definition of LINK_GROUP_DEFINITIONS) {
  for (const kind of definition.memberKinds) BY_KIND.set(kind, definition);
}

export function linkGroupForKind(kind: string): LinkGroupDefinition | null {
  return BY_KIND.get(kind) ?? null;
}

export function isLinkGroup(value: string): value is LinkGroup {
  return LINK_GROUPS.includes(value as LinkGroup);
}
