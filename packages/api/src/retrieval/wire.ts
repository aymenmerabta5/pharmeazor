import {
  RETRIEVAL_WIRE_VERSION,
  buildCitationStamp,
  type RetrievalWireRegistryResponse,
  type RetrievalWireResponse,
} from "@repo/contracts";
import type { RegistryLookupResult, RetrievalResult } from "@repo/services/retrieval";

/**
 * Map the service result onto the wire contract.
 *
 * The mapping is explicit rather than a spread so that adding a field to the
 * domain type cannot leak it onto the wire by accident, and so the citation
 * stamp is computed once, server-side, from the same dates the model is told
 * to quote.
 */
export function toRetrievalWireResponse(
  result: RetrievalResult,
  extra: {
    readonly expandedTerms?: readonly string[];
    readonly ambiguousAliases?: readonly string[];
  } = {},
): RetrievalWireResponse {
  return {
    ok: true,
    wireVersion: RETRIEVAL_WIRE_VERSION,
    chunks: result.chunks.map((chunk) => ({
      chunkId: chunk.chunkId,
      citation: chunk.citation.label,
      title: chunk.title,
      sectionHeading: chunk.sectionHeading,
      sectionPath: chunk.sectionPath,
      sectionCodes: chunk.sectionCodes,
      sourceId: chunk.sourceId,
      sourceName: chunk.sourceName,
      documentType: chunk.documentType,
      language: chunk.language,
      authorityLevel: chunk.authorityLevel,
      authorityTier: chunk.authorityTier,
      authority: chunk.authority,
      medicineNames: chunk.medicineNames,
      sourceUrls: chunk.sourceUrls,
      publicationDate: chunk.publicationDate,
      collectedAt: chunk.collectedAt,
      extractedAt: chunk.extractedAt,
      indexedAt: chunk.indexedAt,
      extractionStatus: chunk.extractionStatus,
      reviewRequired: chunk.reviewRequired,
      citationStamp: buildCitationStamp({
        sourceName: chunk.sourceName,
        publicationDate: chunk.publicationDate,
        extractedAt: chunk.extractedAt,
        extractionStatus: chunk.extractionStatus,
        reviewRequired: chunk.reviewRequired,
      }),
      content: chunk.content,
      contentTruncated: false,
    })),
    authorityPolicy: result.authorityPolicy,
    authorityOverlaps: result.authorityOverlaps,
    diagnostics: {
      embeddingModel: result.diagnostics.embeddingModel,
      rerankerModel: result.diagnostics.rerankerModel,
      rerank: result.diagnostics.rerank,
      denseCandidates: result.diagnostics.denseCandidates,
      lexicalCandidates: result.diagnostics.lexicalCandidates,
      graph: result.diagnostics.graph,
      graphCandidates: result.diagnostics.graphCandidates,
      fusedCandidates: result.diagnostics.fusedCandidates,
      rerankedCandidates: result.diagnostics.rerankedCandidates,
      returnedChunks: result.diagnostics.returnedChunks,
      droppedForInjection: result.diagnostics.droppedForInjection,
      elapsedMs: result.diagnostics.elapsedMs,
      expandedTerms: extra.expandedTerms ?? result.diagnostics.expandedTerms ?? [],
      ambiguousAliases: extra.ambiguousAliases ?? result.diagnostics.ambiguousAliases ?? [],
    },
  };
}

/**
 * Map the register result onto the wire contract.
 *
 * The disclaimer is attached here, server-side, rather than left to the model:
 * a register row that reaches the user without the "not a clinical
 * recommendation" boundary is the failure mode this whole route exists to
 * prevent.
 */
export function toRegistryWireResponse(
  result: RegistryLookupResult,
): RetrievalWireRegistryResponse {
  return {
    ok: true,
    wireVersion: RETRIEVAL_WIRE_VERSION,
    query: result.query,
    kind: result.kind,
    products: result.products.map((product) => ({
      registrationNumber: product.registrationNumber,
      brand: product.brand,
      dci: product.dci,
      dciCode: product.dciCode,
      form: product.form,
      dosage: product.dosage,
      pack: product.pack,
      schedule: product.schedule,
      holder: product.holder,
      holderCountry: product.holderCountry,
      productType: product.productType,
      registrationStatus: product.registrationStatus,
      withdrawalDate: product.withdrawalDate,
      withdrawalReason: product.withdrawalReason,
      shelfLife: product.shelfLife,
      isCombination: product.isCombination,
      inScope: product.inScope,
      medicineIds: product.medicineIds,
    })),
    total: result.total,
    truncated: result.truncated,
    includeWithdrawn: result.includeWithdrawn,
    disclaimer: result.disclaimer,
  };
}
