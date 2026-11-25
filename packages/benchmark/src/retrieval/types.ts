/** Recorded retrieval shapes shared by the gate and the RAG arm. */

export interface TraceChunk {
  readonly rank: number;
  readonly chunk_id: string;
  readonly artifact_id: string;
  readonly section_code: string;
  readonly citation_label: string;
  readonly text: string;
  readonly injection_risk: boolean;
  readonly scores: Record<string, unknown>;
}

export interface RetrievalTraceRow {
  readonly question_id: string;
  readonly query: string;
  readonly retrieval_config_hash: string;
  readonly config: string;
  readonly authority_policy: string;
  readonly diagnostics: Record<string, unknown>;
  /** Fused candidates before the result limit, for candidate-recall diagnosis. */
  readonly candidate_chunk_ids: readonly string[];
  readonly chunks: readonly TraceChunk[];
}

export interface RetrievedPassage {
  /** Stable [E#] marker shown to the model and used by citation checks. */
  readonly evidence_id: string;
  readonly chunk_id: string;
  readonly citation_label: string;
  readonly text: string;
}

export interface RetrievalGateway {
  /** Retrieved passages for a question, already filtered for injection risk. */
  search(questionId: string): readonly RetrievedPassage[];
  /** Hash of the retrieval configuration that produced the trace. */
  configHash(): string;
}
