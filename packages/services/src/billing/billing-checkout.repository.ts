import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@repo/database";
import { checkouts } from "@repo/billing";
import type { BillingCheckoutRepositoryPort } from "./create-checkout.service";

const CHECKOUT_CREATION_LEASE_MS = 5 * 60 * 1_000;

export const billingCheckoutRepository: BillingCheckoutRepositoryPort = {
  async claim({ actorId, provider, requestKey }) {
    const now = new Date();
    const leaseToken = randomUUID();
    const [created] = await db
      .insert(checkouts)
      .values({
        userId: actorId,
        provider,
        requestKey,
        creationState: "creating",
        creationStartedAt: now,
        creationLeaseToken: leaseToken,
        status: "pending",
      })
      .onConflictDoNothing({ target: [checkouts.userId, checkouts.provider, checkouts.requestKey] })
      .returning({ leaseToken: checkouts.creationLeaseToken });
    if (created?.leaseToken) return { status: "claimed", leaseToken: created.leaseToken };
    const existing = await db.query.checkouts.findFirst({
      where: and(
        eq(checkouts.userId, actorId),
        eq(checkouts.provider, provider),
        eq(checkouts.requestKey, requestKey),
      ),
    });
    if (existing?.creationState === "ready" && existing.providerCheckoutId && existing.url) {
      return {
        status: "completed",
        checkout: { id: existing.providerCheckoutId, url: existing.url },
      };
    }
    if (!existing) throw new Error("Checkout intent claim disappeared");
    if (
      existing.creationStartedAt &&
      existing.creationStartedAt.getTime() > now.getTime() - CHECKOUT_CREATION_LEASE_MS
    ) {
      return { status: "in_flight" };
    }
    const leaseOwnerGuard = existing.creationLeaseToken
      ? eq(checkouts.creationLeaseToken, existing.creationLeaseToken)
      : isNull(checkouts.creationLeaseToken);
    const leaseTimeGuard = existing.creationStartedAt
      ? eq(checkouts.creationStartedAt, existing.creationStartedAt)
      : isNull(checkouts.creationStartedAt);
    const [reclaimed] = await db
      .update(checkouts)
      .set({ creationStartedAt: now, creationLeaseToken: leaseToken, updatedAt: now })
      .where(
        and(
          eq(checkouts.id, existing.id),
          eq(checkouts.creationState, "creating"),
          leaseOwnerGuard,
          leaseTimeGuard,
        ),
      )
      .returning({ leaseToken: checkouts.creationLeaseToken });
    return reclaimed?.leaseToken
      ? { status: "claimed", leaseToken: reclaimed.leaseToken }
      : { status: "in_flight" };
  },
  async complete({ actorId, provider, requestKey, leaseToken, providerCheckoutId, url }) {
    const [stored] = await db
      .update(checkouts)
      .set({
        providerCheckoutId,
        url,
        creationState: "ready",
        creationStartedAt: null,
        creationLeaseToken: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkouts.userId, actorId),
          eq(checkouts.provider, provider),
          eq(checkouts.requestKey, requestKey),
          eq(checkouts.creationState, "creating"),
          eq(checkouts.creationLeaseToken, leaseToken),
        ),
      )
      .returning({ id: checkouts.id });
    if (stored) return;
    const existing = await db.query.checkouts.findFirst({
      where: and(
        eq(checkouts.userId, actorId),
        eq(checkouts.provider, provider),
        eq(checkouts.requestKey, requestKey),
      ),
    });
    if (existing?.creationState === "ready" && existing.providerCheckoutId === providerCheckoutId) {
      if (existing.url !== url)
        await db
          .update(checkouts)
          .set({ url, updatedAt: new Date() })
          .where(eq(checkouts.id, existing.id));
      return;
    }
    throw new Error("Checkout intent completion lost its lease");
  },
};
