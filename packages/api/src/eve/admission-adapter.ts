import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@repo/database";
import { eveAgentAdmissions, eveAgentRuntimeEvents, eveAgentRuntimeSessions } from "@repo/database";
import { subscriptions } from "@repo/billing";
import { buildEntitlementPredicate, AGENT_ENTITLED_PLAN_IDS } from "@repo/services/billing";
import {
  EVE_ADMISSION_LEASE_MS,
  EVE_MAX_CONCURRENT_OPERATIONS,
  EVE_MAX_OPERATIONS_PER_WINDOW,
  EVE_OPERATION_RATE_WINDOW_MS,
  isTerminalEveRuntimeEvent,
  type AgentAdmissionPort,
  type AgentRuntimeAdmissionPort,
} from "@repo/services/eve";

export const agentAdmissionPort = {
  async admit(input) {
    if (!input.actor.emailVerified) {
      return { ok: false as const, code: "EVE_ENTITLEMENT_REQUIRED" as const };
    }
    const now = input.requestedAt;
    if (!Number.isFinite(now.getTime())) throw new Error("Eve admission timestamp is invalid");
    const rateWindowMs = EVE_OPERATION_RATE_WINDOW_MS;
    const operationLimit = EVE_MAX_OPERATIONS_PER_WINDOW;
    const windowStartedAt = new Date(now.getTime() - rateWindowMs);
    const leaseExpiresAt = new Date(now.getTime() + EVE_ADMISSION_LEASE_MS);
    return await db.transaction(async (transaction) => {
      // Serialize admission for one user across every application process.
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"eve:" + input.actor.userId}, 0))`,
      );
      const entitled = await transaction
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, input.actor.userId),
            // One predicate for every rail: the subscription is live while its
            // status grants access and its period has not run out. The period
            // end is never null, so a lapsed subscription grants nothing.
            buildEntitlementPredicate(AGENT_ENTITLED_PLAN_IDS, now),
          ),
        )
        .limit(1);
      if (!entitled[0]) {
        return { ok: false as const, code: "EVE_ENTITLEMENT_REQUIRED" as const };
      }

      await transaction
        .delete(eveAgentAdmissions)
        .where(
          and(
            eq(eveAgentAdmissions.userId, input.actor.userId),
            lt(eveAgentAdmissions.expiresAt, windowStartedAt),
            isNull(eveAgentAdmissions.eveSessionId),
          ),
        );
      const recent = await transaction
        .select({ id: eveAgentAdmissions.id })
        .from(eveAgentAdmissions)
        .where(
          and(
            eq(eveAgentAdmissions.userId, input.actor.userId),
            gte(eveAgentAdmissions.createdAt, windowStartedAt),
          ),
        )
        .limit(operationLimit);
      if (recent.length >= operationLimit) {
        return {
          ok: false as const,
          code: "EVE_RATE_LIMITED" as const,
          retryAfterSeconds: Math.ceil(rateWindowMs / 1_000),
        };
      }
      const active = await transaction
        .select({ expiresAt: eveAgentAdmissions.expiresAt })
        .from(eveAgentAdmissions)
        .where(
          and(
            eq(eveAgentAdmissions.userId, input.actor.userId),
            isNull(eveAgentAdmissions.releasedAt),
            or(gt(eveAgentAdmissions.expiresAt, now), isNotNull(eveAgentAdmissions.eveSessionId)),
          ),
        )
        .limit(EVE_MAX_CONCURRENT_OPERATIONS);
      if (active.length >= EVE_MAX_CONCURRENT_OPERATIONS) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            ((active[0]?.expiresAt.getTime() ?? leaseExpiresAt.getTime()) - now.getTime()) / 1_000,
          ),
        );
        return { ok: false as const, code: "EVE_CONCURRENCY_LIMIT" as const, retryAfterSeconds };
      }
      const leaseId = randomUUID();
      await transaction.insert(eveAgentAdmissions).values({
        id: leaseId,
        userId: input.actor.userId,
        organizationId: input.actor.organizationId,
        teamId: input.actor.teamId,
        eveSessionId: input.eveSessionId,
        operation: input.operation,
        plan: "pro",
        createdAt: now,
        expiresAt: leaseExpiresAt,
      });
      return { ok: true as const, leaseId, plan: "pro" as const };
    });
  },

  async bindSession(input) {
    const [bound] = await db
      .update(eveAgentAdmissions)
      .set({ eveSessionId: input.eveSessionId })
      .where(
        and(
          eq(eveAgentAdmissions.id, input.leaseId),
          eq(eveAgentAdmissions.userId, input.actor.userId),
          or(
            isNull(eveAgentAdmissions.eveSessionId),
            eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
          ),
        ),
      )
      .returning({ id: eveAgentAdmissions.id });
    if (!bound) throw new Error("Eve admission lease could not be bound to its session");
  },

  async listExpiredBoundSessions(input) {
    if (!Number.isFinite(input.inspectedAt.getTime())) {
      throw new Error("Eve admission inspection timestamp is invalid");
    }
    return await db
      .select({
        eveSessionId: eveAgentAdmissions.eveSessionId,
        leaseId: eveAgentAdmissions.id,
      })
      .from(eveAgentAdmissions)
      .where(
        and(
          eq(eveAgentAdmissions.userId, input.actor.userId),
          input.actor.organizationId === null
            ? isNull(eveAgentAdmissions.organizationId)
            : eq(eveAgentAdmissions.organizationId, input.actor.organizationId),
          input.actor.teamId === null
            ? isNull(eveAgentAdmissions.teamId)
            : eq(eveAgentAdmissions.teamId, input.actor.teamId),
          isNotNull(eveAgentAdmissions.eveSessionId),
          isNull(eveAgentAdmissions.releasedAt),
          lte(eveAgentAdmissions.expiresAt, input.inspectedAt),
        ),
      )
      .then((rows) =>
        rows.flatMap((row) =>
          row.eveSessionId === null
            ? []
            : [{ eveSessionId: row.eveSessionId, leaseId: row.leaseId }],
        ),
      );
  },

  async touchSession(input) {
    if (!Number.isFinite(input.touchedAt.getTime())) return;
    await db
      .update(eveAgentAdmissions)
      .set({ expiresAt: new Date(input.touchedAt.getTime() + EVE_ADMISSION_LEASE_MS) })
      .where(
        and(
          eq(eveAgentAdmissions.userId, input.actor.userId),
          input.actor.organizationId === null
            ? isNull(eveAgentAdmissions.organizationId)
            : eq(eveAgentAdmissions.organizationId, input.actor.organizationId),
          input.actor.teamId === null
            ? isNull(eveAgentAdmissions.teamId)
            : eq(eveAgentAdmissions.teamId, input.actor.teamId),
          eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
          isNull(eveAgentAdmissions.releasedAt),
        ),
      );
  },

  async release(input) {
    await db
      .update(eveAgentAdmissions)
      .set({ releasedAt: input.releasedAt })
      .where(
        and(
          eq(eveAgentAdmissions.id, input.leaseId),
          eq(eveAgentAdmissions.userId, input.actor.userId),
          isNull(eveAgentAdmissions.releasedAt),
        ),
      );
  },

  async releaseSession(input) {
    const released = await db
      .update(eveAgentAdmissions)
      .set({ releasedAt: input.releasedAt })
      .where(
        and(
          eq(eveAgentAdmissions.userId, input.actor.userId),
          eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
          isNull(eveAgentAdmissions.releasedAt),
          input.leaseId === undefined ? undefined : eq(eveAgentAdmissions.id, input.leaseId),
        ),
      )
      .returning({ id: eveAgentAdmissions.id });
    return released.length > 0;
  },

  async recordRuntimeEvent(input) {
    if (!Number.isFinite(input.eventAt.getTime()) || !Number.isFinite(input.receivedAt.getTime())) {
      throw new Error("Eve runtime event timestamp is invalid");
    }
    await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"eve-session:" + input.eveSessionId}, 0))`,
      );
      const [recorded] = await transaction
        .insert(eveAgentRuntimeEvents)
        .values({
          eventAt: input.eventAt,
          eventId: input.eventId,
          eventType: input.eventType,
          eveSessionId: input.eveSessionId,
          receivedAt: input.receivedAt,
        })
        .onConflictDoNothing({ target: eveAgentRuntimeEvents.eventId })
        .returning({ eventId: eveAgentRuntimeEvents.eventId });
      // A replay can arrive after newer events. A last-event comparison is not
      // sufficient, and event timestamps are not a total order across Eve
      // workers. The append-only event-id table is the durable replay fence.
      if (!recorded) return;
      const [runtimeState] = await transaction
        .select({
          lastEventAt: eveAgentRuntimeSessions.lastEventAt,
          lastEventId: eveAgentRuntimeSessions.lastEventId,
        })
        .from(eveAgentRuntimeSessions)
        .where(eq(eveAgentRuntimeSessions.eveSessionId, input.eveSessionId))
        .limit(1);
      if (runtimeState) {
        await transaction
          .update(eveAgentRuntimeSessions)
          .set({
            lastEventAt: input.eventAt,
            lastEventId: input.eventId,
            updatedAt: input.receivedAt,
          })
          .where(eq(eveAgentRuntimeSessions.eveSessionId, input.eveSessionId));
      } else {
        await transaction.insert(eveAgentRuntimeSessions).values({
          eveSessionId: input.eveSessionId,
          lastEventAt: input.eventAt,
          lastEventId: input.eventId,
          updatedAt: input.receivedAt,
        });
      }

      let exactLeaseIsActive = false;
      if (input.leaseId !== undefined) {
        const [bound] = await transaction
          .update(eveAgentAdmissions)
          .set({ eveSessionId: input.eveSessionId })
          .where(
            and(
              eq(eveAgentAdmissions.id, input.leaseId),
              or(
                isNull(eveAgentAdmissions.eveSessionId),
                eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
              ),
            ),
          )
          .returning({ id: eveAgentAdmissions.id });
        if (!bound) throw new Error("Eve runtime event lease binding conflicted");
        const [exactLease] = await transaction
          .select({ releasedAt: eveAgentAdmissions.releasedAt })
          .from(eveAgentAdmissions)
          .where(eq(eveAgentAdmissions.id, input.leaseId))
          .limit(1);
        exactLeaseIsActive = exactLease?.releasedAt === null;
        // Never let a stale explicit lease selector fall back to every active
        // lease for the session. The signed callback may be replayed after a
        // later operation has acquired its own lease.
        if (!exactLeaseIsActive) return;
      }

      const compactLifecycleEvent =
        input.eventType === "context.started" || input.eventType === "context.settled";
      const terminalEvent = isTerminalEveRuntimeEvent(input.eventType);
      if (input.leaseId === undefined && !compactLifecycleEvent && !terminalEvent) return;
      const eligible = and(
        eq(eveAgentAdmissions.eveSessionId, input.eveSessionId),
        isNull(eveAgentAdmissions.releasedAt),
        input.leaseId !== undefined
          ? eq(eveAgentAdmissions.id, input.leaseId)
          : and(
              eq(eveAgentAdmissions.operation, "compact"),
              terminalEvent ? isNotNull(eveAgentAdmissions.lastRuntimeEventId) : undefined,
            ),
      );
      if (terminalEvent) {
        await transaction
          .update(eveAgentAdmissions)
          .set({
            lastRuntimeEventAt: input.eventAt,
            lastRuntimeEventId: input.eventId,
            releasedAt: input.receivedAt,
          })
          .where(eligible);
        return;
      }

      await transaction
        .update(eveAgentAdmissions)
        .set({
          expiresAt: new Date(input.receivedAt.getTime() + EVE_ADMISSION_LEASE_MS),
          lastRuntimeEventAt: input.eventAt,
          lastRuntimeEventId: input.eventId,
        })
        .where(eligible);
    });
  },
} satisfies AgentAdmissionPort & AgentRuntimeAdmissionPort;
