export { CLINICAL_LEXICON_VERSION, clinicalMentionLexiconSeeds } from "./clinical-lexicon";
export { MentionLexicon, buildMentionLexicon } from "./lexicon";
export {
  ENTITY_MENTION_TAXONOMY_VERSION,
  MENTION_KIND_DEFINITIONS,
  MENTION_KINDS,
  isMentionKind,
  mentionKindDefinition,
  type MentionFamily,
  type MentionKind,
  type MentionKindDefinition,
  type MentionStorageClass,
} from "./mention-kinds";
export {
  POPULATION_DEFINITIONS,
  PRODUCT_TYPE_LABELS,
  REGULATORY_STATUS_DEFINITIONS,
  ROUTE_DEFINITIONS,
} from "../lexicons";
export {
  foldKgText,
  normalizeConditionKey,
  normalizeDosageForm,
  normalizeJurisdiction,
  normalizeLanguage,
  normalizeOrganizationKey,
  normalizePackaging,
  normalizeProductType,
  normalizeRegistrationStatus,
  normalizeSchedule,
  normalizeStrength,
  splitSubstances,
} from "../normalize";
export { extractTextUnitMentions } from "./text";
export type {
  CandidateObservationState,
  DocumentProvenance,
  ExtractionDiagnostic,
  MatchQuality,
  MentionCandidateRecord,
  MentionLexiconMatch,
  MentionLexiconPort,
  MentionLexiconSeed,
  MentionLexiconSourceRef,
  MentionMethod,
  MetadataRecordRef,
  ObservationEvidence,
  StructuredObservationRecord,
  StructuredRecordRef,
  TextExtractionInput,
  TextExtractionResult,
  TextMentionEvidence,
} from "./types";
