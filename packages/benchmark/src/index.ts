/**
 * Package barrel.
 *
 * Deliberately does NOT re-export `loadGoldAnnotationsFromFile`,
 * `parseGoldAnnotationsJsonl` or the `GoldAnnotation` type. Gold
 * annotations live in `src/dataset/gold-loader.ts` and are reachable
 * only through the validation and review paths.
 */
export {
  QuestionSchema,
  type Question,
  type Category,
  type ExpectedBehavior,
  type Language,
  type ReviewStatus,
  CATEGORY_VALUES,
  EXPECTED_BEHAVIOR_VALUES,
  LANGUAGE_VALUES,
  REVIEW_STATUS_VALUES,
} from "./dataset/schema";

export {
  loadQuestionsFromFile,
  parseQuestionsJsonl,
  filterApprovedForScoredRun,
  DatasetError,
} from "./dataset/loader";

export { validateDataset, validateDatasetFromFiles } from "./dataset/validate";
export { hashQuestions } from "./dataset/hash";
export { sha256 } from "./shared/hash";
