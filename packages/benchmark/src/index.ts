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

// Prompt 3 additions
export { getGroqApiKey, MissingEnvError } from "./config/env";
export { RAW_GENERATION_V1, type GenerationConfig } from "./config/generation";
export { RAW_PROMPT_VERSION, RAW_SYSTEM_PROMPT_V1 } from "./prompts/raw/v1";
export {
  createGroqClient,
  type GroqClient,
  type ChatRequest,
  type ChatResult,
  type ChatUsage,
} from "./providers/groq/client";
export { classifyGroqError, type ClassifiedError, type ErrorClass } from "./providers/groq/errors";
export { buildCacheKey, readCache, writeCache, type CacheKeyInput } from "./runner/cache";
export {
  runRawBenchmark,
  type RawRunInput,
  type RawRunResult,
  type RawRunProgress,
} from "./runner/raw";
