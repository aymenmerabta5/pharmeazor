import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { auth } from "@repo/auth/server";
import { db } from "@repo/database";
import { members, sessions, teamMembers, teams, users } from "@repo/database";

export interface AuthenticatedEveActor {
  readonly authSessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly organizationId: string | null;
  readonly role: string;
  readonly teamId: string | null;
  readonly userId: string;
}

function activeBan(banned: boolean | null, banExpires: Date | null, now: Date): boolean {
  return banned === true && (banExpires === null || banExpires > now);
}

export async function resolveAuthenticatedEveActor(
  headers: Headers,
): Promise<AuthenticatedEveActor | null> {
  const verified = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!verified?.session?.id || !verified.user?.id) return null;

  const now = new Date();
  const rows = await db
    .select({
      authSessionId: sessions.id,
      userId: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      banned: users.banned,
      banExpires: users.banExpires,
      organizationId: sessions.activeOrganizationId,
      teamId: sessions.activeTeamId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, verified.session.id),
        eq(sessions.userId, verified.user.id),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  const actor = rows[0];
  if (!actor || activeBan(actor.banned, actor.banExpires, now)) return null;

  if (actor.organizationId !== null) {
    const membership = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(eq(members.organizationId, actor.organizationId), eq(members.userId, actor.userId)),
      )
      .limit(1);
    if (!membership[0]) return null;
  }

  if (actor.teamId !== null) {
    if (actor.organizationId === null) return null;
    const membership = await db
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
    if (!membership[0]) return null;
  }

  return {
    authSessionId: actor.authSessionId,
    email: actor.email,
    emailVerified: actor.emailVerified === true && verified.user.emailVerified === true,
    organizationId: actor.organizationId,
    role: actor.role ?? "user",
    teamId: actor.teamId,
    userId: actor.userId,
  };
}
