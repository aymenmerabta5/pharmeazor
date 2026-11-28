import "server-only";
import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { db } from "@repo/database";
import { eveAgentSessions } from "@repo/database";
import { isValidEveSessionId } from "@repo/services/harness";
import { fallbackConversationTitle, generateConversationTitle } from "./title";

const MAX_PROMPT_CHARS = 8_000;
const MAX_CONVERSATIONS = 50;

export interface AgentConversationOwner {
  readonly organizationId: string | null;
  readonly teamId: string | null;
  readonly userId: string;
}

export interface AgentConversationSummary {
  /** The durable Eve session id, which is also the conversation id. */
  readonly id: string;
  readonly title: string | null;
  readonly updatedAt: string;
}

function ownerCondition(owner: AgentConversationOwner): SQL {
  return and(
    eq(eveAgentSessions.userId, owner.userId),
    owner.organizationId === null
      ? isNull(eveAgentSessions.organizationId)
      : eq(eveAgentSessions.organizationId, owner.organizationId),
    owner.teamId === null
      ? isNull(eveAgentSessions.teamId)
      : eq(eveAgentSessions.teamId, owner.teamId),
  ) as SQL;
}

function toSummary(row: {
  eveSessionId: string;
  title: string | null;
  updatedAt: Date;
}): AgentConversationSummary {
  return {
    id: row.eveSessionId,
    title: row.title?.trim() || null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The signed-in owner's non-retired conversations, newest activity first.
 *
 * Only titled rows are conversations the owner actually used: a session is
 * claimed before its first turn and gets its title from that first prompt. An
 * untitled row is either a prewarmed session that never ran or a row whose Eve
 * session no longer exists, and neither belongs in the history list.
 */
export async function listAgentConversations(
  owner: AgentConversationOwner,
  limit = MAX_CONVERSATIONS,
): Promise<AgentConversationSummary[]> {
  const bounded = Math.max(1, Math.min(MAX_CONVERSATIONS, Math.trunc(limit)));
  const rows = await db
    .select({
      eveSessionId: eveAgentSessions.eveSessionId,
      title: eveAgentSessions.title,
      updatedAt: eveAgentSessions.updatedAt,
    })
    .from(eveAgentSessions)
    .where(
      and(
        ownerCondition(owner),
        isNull(eveAgentSessions.retiredAt),
        isNotNull(eveAgentSessions.title),
      ),
    )
    .orderBy(desc(eveAgentSessions.updatedAt))
    .limit(bounded);
  return rows.map(toSummary);
}

/**
 * One owned, non-retired row, whether or not its title has been generated.
 *
 * The title request runs while the first turn is already streaming, so the row
 * must stay reachable by id before it has a label.
 */
async function findAgentConversationRow(
  owner: AgentConversationOwner,
  eveSessionId: string,
): Promise<{ eveSessionId: string; title: string | null; updatedAt: Date } | null> {
  if (!isValidEveSessionId(eveSessionId)) return null;
  const rows = await db
    .select({
      eveSessionId: eveAgentSessions.eveSessionId,
      title: eveAgentSessions.title,
      updatedAt: eveAgentSessions.updatedAt,
    })
    .from(eveAgentSessions)
    .where(
      and(
        eq(eveAgentSessions.eveSessionId, eveSessionId),
        ownerCondition(owner),
        isNull(eveAgentSessions.retiredAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * One owned conversation that has a history label.
 *
 * An untitled row is not a conversation the owner can open: either the title
 * request has not landed yet or the session was prewarmed and never used.
 * Treating it as absent keeps an empty session from resuming into a blank chat.
 */
export async function getAgentConversation(
  owner: AgentConversationOwner,
  eveSessionId: string,
): Promise<AgentConversationSummary | null> {
  const row = await findAgentConversationRow(owner, eveSessionId);
  return row?.title ? toSummary(row) : null;
}

/**
 * Generates and stores the title exactly once per session.
 *
 * The facade claims the row when Eve creates the session, so this only writes
 * a row the caller already owns. Concurrent first turns race on the same
 * `title IS NULL` predicate; the loser reads the winner's title instead of
 * overwriting it.
 */
export async function ensureAgentConversationTitle(input: {
  readonly owner: AgentConversationOwner;
  readonly eveSessionId: string;
  readonly prompt: string;
}): Promise<AgentConversationSummary | null> {
  const existing = await findAgentConversationRow(input.owner, input.eveSessionId);
  if (!existing) return null;
  if (existing.title) return toSummary(existing);

  const prompt = input.prompt.trim().slice(0, MAX_PROMPT_CHARS);
  const title = prompt ? await generateConversationTitle(prompt) : fallbackConversationTitle("");
  const updated = await db
    .update(eveAgentSessions)
    .set({ title, updatedAt: new Date() })
    .where(
      and(
        eq(eveAgentSessions.eveSessionId, input.eveSessionId),
        ownerCondition(input.owner),
        isNull(eveAgentSessions.title),
        isNull(eveAgentSessions.retiredAt),
      ),
    )
    .returning({
      eveSessionId: eveAgentSessions.eveSessionId,
      title: eveAgentSessions.title,
      updatedAt: eveAgentSessions.updatedAt,
    });
  return updated[0] ? toSummary(updated[0]) : getAgentConversation(input.owner, input.eveSessionId);
}
