import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@repo/database";
import { eveAgentSessions } from "@repo/database";
import { members, sessions, teamMembers, teams, users } from "@repo/database";
import {
  sameAgentSessionOwner,
  type AgentSessionActor,
  type AgentSessionOwnershipPort,
} from "@repo/services/eve";

async function actorIsAuthoritative(actor: AgentSessionActor): Promise<boolean> {
  const now = new Date();
  const active = await db
    .select({
      banned: users.banned,
      banExpires: users.banExpires,
      organizationId: sessions.activeOrganizationId,
      teamId: sessions.activeTeamId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, actor.authSessionId),
        eq(sessions.userId, actor.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  const value = active[0];
  if (
    !value ||
    (value.banned === true && (value.banExpires === null || value.banExpires > now)) ||
    value.organizationId !== actor.organizationId ||
    value.teamId !== actor.teamId
  ) {
    return false;
  }
  if (actor.organizationId === null) return actor.teamId === null;
  const membership = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.organizationId, actor.organizationId), eq(members.userId, actor.userId)))
    .limit(1);
  if (!membership[0]) return false;
  if (actor.teamId === null) return true;
  const teamMembership = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(
      and(
        eq(teamMembers.teamId, actor.teamId),
        eq(teamMembers.userId, actor.userId),
        eq(teams.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  return teamMembership[0] !== undefined;
}

export const agentSessionOwnershipPort: AgentSessionOwnershipPort = {
  async claim(input) {
    if (!(await actorIsAuthoritative(input.actor))) return "conflict";
    const inserted = await db
      .insert(eveAgentSessions)
      .values({
        eveSessionId: input.eveSessionId,
        userId: input.actor.userId,
        organizationId: input.actor.organizationId,
        teamId: input.actor.teamId,
        createdByAuthSessionId: input.actor.authSessionId,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing({ target: eveAgentSessions.eveSessionId })
      .returning({ eveSessionId: eveAgentSessions.eveSessionId });
    if (inserted[0]) return "created";
    const existing = await db
      .select({
        userId: eveAgentSessions.userId,
        organizationId: eveAgentSessions.organizationId,
        teamId: eveAgentSessions.teamId,
        retiredAt: eveAgentSessions.retiredAt,
      })
      .from(eveAgentSessions)
      .where(eq(eveAgentSessions.eveSessionId, input.eveSessionId))
      .limit(1);
    const record = existing[0];
    return record && record.retiredAt === null && sameAgentSessionOwner(record, input.actor)
      ? "existing"
      : "conflict";
  },

  async authorize(input) {
    if (!(await actorIsAuthoritative(input.actor))) return false;
    const rows = await db
      .select({
        userId: eveAgentSessions.userId,
        organizationId: eveAgentSessions.organizationId,
        teamId: eveAgentSessions.teamId,
        retiredAt: eveAgentSessions.retiredAt,
      })
      .from(eveAgentSessions)
      .where(eq(eveAgentSessions.eveSessionId, input.eveSessionId))
      .limit(1);
    const record = rows[0];
    return (
      record !== undefined &&
      record.retiredAt === null &&
      sameAgentSessionOwner(record, input.actor)
    );
  },

  async retire(input) {
    if (!(await agentSessionOwnershipPort.authorize(input))) return false;
    const updated = await db
      .update(eveAgentSessions)
      .set({ retiredAt: input.retiredAt })
      .where(
        and(
          eq(eveAgentSessions.eveSessionId, input.eveSessionId),
          isNull(eveAgentSessions.retiredAt),
        ),
      )
      .returning({ eveSessionId: eveAgentSessions.eveSessionId });
    return updated[0] !== undefined;
  },
};
