import type { RunMetadata, ResponseLine, ErrorLine } from "../storage/fs";
import type { EvaluationRecord } from "../evaluation/schema";
import type { SummaryMetrics } from "../evaluation/metrics";

export interface ReproCheck {
  name: string;
  passed: boolean;
  details: string;
}

export interface ReproReport {
  run_id: string;
  passed: boolean;
  checks: ReproCheck[];
}

export interface ReproInput {
  metadata: RunMetadata | null;
  responses: readonly ResponseLine[];
  errors: readonly ErrorLine[];
  evaluation: readonly EvaluationRecord[];
  summary: SummaryMetrics | null;
  fileContents: Map<string, string>;
}

const REQUIRED_META_FIELDS = [
  "run_id",
  "started_at",
  "updated_at",
  "status",
  "model_id",
  "provider",
  "reasoning_effort",
  "prompt_version",
  "dataset_version",
  "dataset_hash",
  "generation",
  "total_questions",
  "allow_draft",
] as const;

const SECRET_PATTERNS = [/gsk_[A-Za-z0-9_-]{10,}/, /GROQ_API_KEY=/];

export function checkReproducibility(input: ReproInput): ReproReport {
  const checks: ReproCheck[] = [];

  if (!input.metadata) {
    return {
      run_id: "unknown",
      passed: false,
      checks: [
        { name: "run_metadata.json present", passed: false, details: "file missing or unreadable" },
      ],
    };
  }

  const m = input.metadata;
  const missing = REQUIRED_META_FIELDS.filter(
    (f) => (m as unknown as Record<string, unknown>)[f] === undefined,
  );
  checks.push({
    name: "required metadata fields present",
    passed: missing.length === 0,
    details: missing.length === 0 ? "all present" : `missing: ${missing.join(", ")}`,
  });

  checks.push({
    name: "cumulative_usage recorded",
    passed: m.cumulative_usage !== undefined,
    details: m.cumulative_usage
      ? `api_calls=${m.cumulative_usage.api_calls}, cache_hits=${m.cumulative_usage.cache_hits}, total_tokens=${m.cumulative_usage.total_tokens}`
      : "missing",
  });

  const accounted = input.responses.length + input.errors.length;
  checks.push({
    name: "every selected question accounted for",
    passed: accounted === m.total_questions,
    details: `${input.responses.length} responses + ${input.errors.length} errors = ${accounted} of ${m.total_questions}`,
  });

  const missingCacheKeys = input.responses.filter((r) => !r.cache_key).length;
  checks.push({
    name: "every response has a cache_key",
    passed: missingCacheKeys === 0,
    details: missingCacheKeys === 0 ? "all present" : `${missingCacheKeys} missing`,
  });

  const missingHashes = input.evaluation.filter(
    (e) => !e.response_content_hash || !e.annotation_hash,
  ).length;
  checks.push({
    name: "every evaluation record has content + annotation hashes",
    passed: missingHashes === 0,
    details: missingHashes === 0 ? "all present" : `${missingHashes} missing`,
  });

  checks.push({
    name: "summary.json present",
    passed: input.summary !== null,
    details: input.summary !== null ? `generated_at=${input.summary.generated_at}` : "missing",
  });

  const secretHits: string[] = [];
  for (const [path, content] of input.fileContents) {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        secretHits.push(path);
        break;
      }
    }
  }
  checks.push({
    name: "no API key or secret in run directory files",
    passed: secretHits.length === 0,
    details: secretHits.length === 0 ? "clean" : `found in: ${secretHits.join(", ")}`,
  });

  return {
    run_id: m.run_id,
    passed: checks.every((c) => c.passed),
    checks,
  };
}
