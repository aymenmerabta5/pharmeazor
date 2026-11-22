import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../shared/hash";

/**
 * Runtime and dependency provenance recorded with every run.
 *
 * The benchmark claims to be reproducible. A model id alone is not enough to
 * reproduce a run: the SDK version, the prompt text, and the runtime all
 * change behaviour. Recording them makes a mismatch detectable instead of
 * invisible.
 */
export interface SdkVersions {
  readonly ai: string;
  readonly groq: string;
}

export interface RunProvenance {
  /** SHA-256 of the exact system prompt sent with every request. */
  readonly system_prompt_hash: string;
  /** SHA-256 of the exact selected question ids, in run order. */
  readonly selection_hash: string;
  readonly selected_question_ids: readonly string[];
  /** `null` means the parameter is deliberately unset, not unknown. */
  readonly temperature: number | null;
  readonly seed: number | null;
  /** Model revision reported by the provider, when it reports one. */
  readonly model_revision: string | null;
  readonly sdk: SdkVersions;
  readonly runtime: {
    readonly bun: string;
    readonly node: string;
    readonly platform: string;
  };
}

interface PackageManifest {
  dependencies?: Record<string, string>;
}

function readManifest(): PackageManifest {
  return JSON.parse(
    readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
  ) as PackageManifest;
}

const manifest = readManifest();

export const SDK_VERSIONS: SdkVersions = Object.freeze({
  ai: manifest.dependencies?.ai ?? "unknown",
  groq: manifest.dependencies?.["@ai-sdk/groq"] ?? "unknown",
});

export function currentRuntime(): RunProvenance["runtime"] {
  return {
    bun: typeof Bun === "undefined" ? "unknown" : Bun.version,
    node: process.version,
    platform: process.platform,
  };
}

export interface ProvenanceInput {
  systemPrompt: string;
  selectedQuestionIds: readonly string[];
  temperature: number | null;
  seed: number | null;
  modelRevision?: string | null;
}

export function buildProvenance(input: ProvenanceInput): RunProvenance {
  return {
    system_prompt_hash: sha256(input.systemPrompt),
    selection_hash: sha256(input.selectedQuestionIds.join("\u001e")),
    selected_question_ids: [...input.selectedQuestionIds],
    temperature: input.temperature,
    seed: input.seed,
    model_revision: input.modelRevision ?? null,
    sdk: SDK_VERSIONS,
    runtime: currentRuntime(),
  };
}
