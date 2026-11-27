/**
 * Package barrel.
 *
 * Deliberately does NOT re-export `loadGoldAnnotationsFromFile`,
 * `parseGoldAnnotationsJsonl` or the `GoldAnnotation` type. Gold
 * annotations live in `src/dataset/gold-loader.ts` and are reachable
 * only through the validation, review and oracle paths.
 */
export {
  QuestionSchema,
  GoldAnnotationSchema,
  EvidencePassageSchema,
  type Question,
  type GoldAnnotation,
  type EvidencePassage,
  type Category,
  type ExpectedBehavior,
  type Language,
  type ReviewStatus,
  type Difficulty,
  CATEGORY_VALUES,
  EXPECTED_BEHAVIOR_VALUES,
  LANGUAGE_VALUES,
  REVIEW_STATUS_VALUES,
  DIFFICULTY_VALUES,
  CHUNK_ID_PATTERN,
} from "./dataset/schema";

export {
  loadQuestionsFromFile,
  parseQuestionsJsonl,
  filterApprovedForScoredRun,
  DatasetError,
} from "./dataset/loader";

export { validateDataset, validateDatasetFromFiles } from "./dataset/validate";
export { hashQuestions, hashSelection } from "./dataset/hash";
export { sha256 } from "./shared/hash";

export { getGroqApiKey, MissingEnvError } from "./config/env";
export {
  RAW_GENERATION_V1,
  RATE_LIMITS_FREE_TIER,
  type GenerationConfig,
} from "./config/generation";
export {
  SDK_VERSIONS,
  buildProvenance,
  currentRuntime,
  type RunProvenance,
  type SdkVersions,
} from "./config/provenance";
export { RAW_PROMPT_VERSION, RAW_SYSTEM_PROMPT_V1 } from "./prompts/raw/v1";
export {
  ORACLE_PROMPT_VERSION,
  ORACLE_SYSTEM_PROMPT_V1,
  buildOracleUserMessage,
  CITATION_PATTERN,
} from "./prompts/oracle/v1";
export {
  createGroqClient,
  type GroqClient,
  type ChatRequest,
  type ChatResult,
  type ChatUsage,
} from "./providers/groq/client";
export { classifyGroqError, type ClassifiedError, type ErrorClass } from "./providers/groq/errors";
export {
  buildCacheKey,
  readCache,
  writeCache,
  CacheCorruptionError,
  type CacheKeyInput,
} from "./runner/cache";
export {
  createRateLimiter,
  RateLimitExceededError,
  type RateLimiter,
  type RateLimitKind,
} from "./runner/rate-limit";
export {
  runChatBenchmark,
  estimatePromptTokens,
  SelectionMismatchError,
  type BenchmarkArm,
  type ChatBenchmarkInput,
  type ChatRunProgress,
  type ChatRunResult,
} from "./runner/chat";
export { runRawBenchmark, type RawRunInput, type RawRunResult } from "./runner/raw";
export { runOracleBenchmark, type OracleRunInput, type OracleRunResult } from "./runner/oracle";
export { runRagBenchmark, type RagRunInput, type RagRunResult } from "./runner/rag";
export {
  ARM_LABELS,
  ARM_RETRIEVAL_ORDERING,
  ARM_SHORT_LABELS,
  BENCHMARK_ARMS,
  RETRIEVAL_ARMS,
  armLabel,
  isBenchmarkArm,
  isRetrievalArm,
  type RetrievalArm,
} from "./arms";
export { loadEvidenceBundle, hashEvidenceBundle } from "./oracle/evidence";
export {
  GRAPH_TRACE_NAME,
  GraphArmNotReadyError,
  createTraceGateway,
  hasRerankScores,
  loadGraphTrace,
  loadRetrievalTrace,
  orderTraceChunks,
} from "./retrieval/trace";
export { loadArmTrace, type ArmTracePaths } from "./retrieval/arm-trace";
export { computeRetrievalMetrics } from "./retrieval/metrics";
export { summarizeRetrieval, type RetrievalReportInput } from "./reporting/retrieval";
export {
  computeArmDeltas,
  formatArmsReport,
  type ArmReportRow,
  type ArmsReportInput,
  type ArmDelta,
} from "./reporting/arms";
export type {
  RetrievalGateway,
  RetrievalOrdering,
  RetrievalTraceRow,
  RetrievedPassage,
  TraceChunk,
} from "./retrieval/types";

export type {
  DeterministicSignals,
  GroundingSignals,
  HumanScore,
  EvaluationRecord,
  Correctness,
  Completeness,
  NumericalAccuracy,
  AbstentionOutcome,
  SafetyVerdict,
  CitationVerdict,
} from "./evaluation/schema";
export { computeDeterministicSignals, type RubricInput } from "./evaluation/rubric";
export { extractNumbers, compareNumerical } from "./evaluation/numerical";
export { detectBehavior } from "./evaluation/behavior";
export { detectSafety } from "./evaluation/safety";
export {
  parseCitations,
  computeGroundingSignals,
  computeGroundingSummary,
} from "./evaluation/grounding";
export { computeSummary, type SummaryMetrics } from "./evaluation/metrics";

export {
  generateMarkdownReport,
  type ReportInput,
  type GeneratedReport,
} from "./reporting/markdown";
export {
  compareRuns,
  formatComparison,
  type ComparisonResult,
  type ComparableRun,
} from "./reporting/compare";
export { checkReproducibility, type ReproReport, type ReproCheck } from "./reporting/checks";
