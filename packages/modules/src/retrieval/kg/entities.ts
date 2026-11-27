import { createHash } from "node:crypto";

import { foldKgText } from "./normalize";
import type {
  KgAliasRecord,
  KgEntityRecord,
  KgEntitySourceRecord,
  KgEntityType,
  KgSourceKind,
} from "./types";

/**
 * In-memory entity accumulator.
 *
 * Every seed path goes through this class, so two sources that describe the
 * same brand, substance, or holder converge on one entity before anything is
 * written. The entity id is `type + hash(key)`, and the key is normalised by the
 * caller, which makes a rebuild stable even when a source row moves.
 */

export interface EntitySeed {
  readonly entityType: KgEntityType;
  readonly entityKey: string;
  readonly canonicalLabel: string;
  readonly confidence?: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

export interface AliasSeed {
  readonly raw: string;
  readonly language?: string | null;
  readonly sourceId: string;
  readonly confidence?: number;
}

export interface SourceSeed {
  readonly sourceKind: KgSourceKind;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourceUrl?: string | null;
  readonly evidence?: Readonly<Record<string, unknown>>;
}

interface MutableAlias {
  aliasRaw: string;
  language: string | null;
  sourceId: string;
  confidence: number;
}

interface MutableSource extends SourceSeed {
  readonly identity: string;
}

interface MutableEntity {
  readonly entityId: string;
  readonly entityType: KgEntityType;
  readonly entityKey: string;
  canonicalLabel: string;
  confidence: number;
  attributes: Record<string, unknown>;
  readonly aliases: Map<string, MutableAlias>;
  readonly sources: Map<string, MutableSource>;
}

export function entityIdFor(entityType: KgEntityType, entityKey: string): string {
  const digest = createHash("sha256")
    .update(entityType)
    .update("\u0000")
    .update(entityKey)
    .digest("hex")
    .slice(0, 24);
  return `ent_${entityType}_${digest}`;
}

export class EntityAccumulator {
  private readonly entities = new Map<string, MutableEntity>();

  get size(): number {
    return this.entities.size;
  }

  add(seed: EntitySeed, aliases: readonly AliasSeed[] = [], sources: readonly SourceSeed[] = []): string {
    const entityKey = seed.entityKey.trim();
    if (!entityKey) throw new Error(`Entity key is empty for ${seed.entityType}`);
    const entityId = entityIdFor(seed.entityType, entityKey);
    const existing = this.entities.get(entityId);
    const confidence = clampConfidence(seed.confidence ?? 1);
    if (!existing) {
      const entity: MutableEntity = {
        entityId,
        entityType: seed.entityType,
        entityKey,
        canonicalLabel: seed.canonicalLabel.trim() || entityKey,
        confidence,
        attributes: sanitizeAttributes(seed.attributes),
        aliases: new Map(),
        sources: new Map(),
      };
      this.entities.set(entityId, entity);
    } else {
      if (labelScore(seed.canonicalLabel) > labelScore(existing.canonicalLabel)) {
        existing.canonicalLabel = seed.canonicalLabel.trim() || existing.entityKey;
      }
      existing.confidence = Math.max(existing.confidence, confidence);
      mergeAttributes(existing.attributes, seed.attributes);
    }

    const entity = this.entities.get(entityId)!;
    this.addAlias(entityId, {
      raw: entity.canonicalLabel,
      sourceId: aliases[0]?.sourceId ?? "canonical",
      confidence,
    });
    for (const alias of aliases) this.addAlias(entityId, alias);
    for (const source of sources) this.addSource(entityId, source);
    return entityId;
  }

  addAlias(entityId: string, alias: AliasSeed): void {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Unknown entity: ${entityId}`);
    const raw = alias.raw.replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 300) return;
    const aliasNorm = foldKgText(raw);
    if (!aliasNorm) return;
    const confidence = clampConfidence(alias.confidence ?? 1);
    const existing = entity.aliases.get(aliasNorm);
    if (!existing) {
      entity.aliases.set(aliasNorm, {
        aliasRaw: raw,
        language: alias.language ?? null,
        sourceId: alias.sourceId,
        confidence,
      });
      return;
    }
    if (confidence > existing.confidence) {
      existing.confidence = confidence;
      existing.sourceId = alias.sourceId;
      existing.language = alias.language ?? existing.language;
    }
    if (labelScore(raw) > labelScore(existing.aliasRaw)) existing.aliasRaw = raw;
  }

  addSource(entityId: string, source: SourceSeed): void {
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Unknown entity: ${entityId}`);
    const sourceId = source.sourceId.trim();
    const sourceKey = source.sourceKey.trim();
    if (!sourceId || !sourceKey) return;
    const identity = `${source.sourceKind}\u0000${sourceId}\u0000${sourceKey}`;
    if (entity.sources.has(identity)) return;
    entity.sources.set(identity, {
      ...source,
      sourceId,
      sourceKey,
      sourceUrl: source.sourceUrl ?? null,
      evidence: sanitizeAttributes(source.evidence),
      identity,
    });
  }

  has(entityType: KgEntityType, entityKey: string): boolean {
    return this.entities.has(entityIdFor(entityType, entityKey));
  }

  idFor(entityType: KgEntityType, entityKey: string): string | undefined {
    const entityId = entityIdFor(entityType, entityKey);
    return this.entities.has(entityId) ? entityId : undefined;
  }

  /**
   * Every alias with the owning type. The build filters this list before it
   * builds a gazetteer: a two-character language code is not a useful mention.
   */
  gazetteerSeeds(): Array<{
    readonly entityId: string;
    readonly entityType: KgEntityType;
    readonly aliasRaw: string;
    readonly confidence: number;
  }> {
    const seeds: Array<{
      entityId: string;
      entityType: KgEntityType;
      aliasRaw: string;
      confidence: number;
    }> = [];
    for (const entity of this.entities.values()) {
      for (const alias of entity.aliases.values()) {
        seeds.push({
          entityId: entity.entityId,
          entityType: entity.entityType,
          aliasRaw: alias.aliasRaw,
          confidence: alias.confidence,
        });
      }
    }
    return seeds;
  }

  finalize(): {
    readonly entities: readonly KgEntityRecord[];
    readonly aliases: readonly KgAliasRecord[];
    readonly sources: readonly KgEntitySourceRecord[];
  } {
    const entities: KgEntityRecord[] = [];
    const aliases: KgAliasRecord[] = [];
    const sources: KgEntitySourceRecord[] = [];

    for (const entity of this.entities.values()) {
      const normalizedLabel = foldKgText(entity.canonicalLabel) || foldKgText(entity.entityKey);
      entities.push({
        entityId: entity.entityId,
        entityType: entity.entityType,
        entityKey: entity.entityKey,
        canonicalLabel: entity.canonicalLabel,
        normalizedLabel,
        confidence: entity.confidence,
        attributes: entity.attributes,
      });
      for (const [aliasNorm, alias] of entity.aliases) {
        aliases.push({
          entityId: entity.entityId,
          aliasNorm,
          aliasRaw: alias.aliasRaw,
          language: alias.language,
          sourceId: alias.sourceId,
          confidence: alias.confidence,
        });
      }
      for (const source of entity.sources.values()) {
        sources.push({
          entityId: entity.entityId,
          sourceKind: source.sourceKind,
          sourceId: source.sourceId,
          sourceKey: source.sourceKey,
          sourceUrl: source.sourceUrl ?? null,
          evidence: source.evidence ?? {},
        });
      }
    }

    entities.sort(
      (left, right) =>
        left.entityType.localeCompare(right.entityType) ||
        left.entityKey.localeCompare(right.entityKey),
    );
    aliases.sort(
      (left, right) =>
        left.entityId.localeCompare(right.entityId) || left.aliasNorm.localeCompare(right.aliasNorm),
    );
    sources.sort(
      (left, right) =>
        left.entityId.localeCompare(right.entityId) ||
        left.sourceKind.localeCompare(right.sourceKind) ||
        left.sourceId.localeCompare(right.sourceId) ||
        left.sourceKey.localeCompare(right.sourceKey),
    );
    return { entities, aliases, sources };
  }
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function sanitizeAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined,
): Record<string, unknown> {
  if (!attributes) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === "") continue;
    result[key] = value;
  }
  return result;
}

function mergeAttributes(
  target: Record<string, unknown>,
  incoming: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!incoming) return;
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null || value === "") continue;
    const current = target[key];
    if (current === undefined) {
      target[key] = value;
      continue;
    }
    if (Array.isArray(current) && Array.isArray(value)) {
      target[key] = [...new Set([...current, ...value])].sort();
      continue;
    }
    if (typeof current === "boolean" && typeof value === "boolean") {
      target[key] = current || value;
    }
  }
}

/** Prefer mixed-case human labels over ALL CAPS source spellings. */
function labelScore(label: string): number {
  const letters = label.replace(/[^\p{L}]/gu, "");
  if (!letters) return 0;
  const lowercase = (letters.match(/\p{Ll}/gu) ?? []).length;
  const uppercase = (letters.match(/\p{Lu}/gu) ?? []).length;
  let score = lowercase > 0 ? 2 : 0;
  if (lowercase > 0 && uppercase > 0) score += 1;
  return score;
}
