import "server-only";
import { db } from "@repo/database";
import {
  extendBillingPeriod,
  type BillingProviderName,
  type SubscriptionStatus,
} from "@repo/billing";
import type { BillingPlanCatalogPort } from "./billing-price-catalog";

/**
 * A connection that can run the subscription statements.
 *
 * The database handle and a transaction both satisfy it, so a write that has
 * to commit together with other work can run inside that worker's
 * transaction.
 */
export interface BillingExecutor {
  select: typeof db.select;
  insert: typeof db.insert;
  update: typeof db.update;
}

/**
 * The state a subscription row holds.
 *
 * `periodStart` and `periodEnd` are the covered window. `periodEnd` is the
 * expiry and is never absent, so a lapsed subscription is a row with a past
 * expiry rather than a row with no expiry.
 */
export interface SubscriptionWrite {
  readonly userId: string;
  readonly planId: string;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly status: SubscriptionStatus;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  /** True only when the rail can charge again without a fresh authorization. */
  readonly autoRenew: boolean;
  readonly cancelAtPeriodEnd: boolean;
  readonly trialEnd?: Date | null;
  readonly priceId?: string | null;
  readonly productId?: string | null;
  readonly customerId?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly providerEventAt?: Date | null;
}

/**
 * The row as it stands, as the fencing token returns it.
 *
 * It carries every column, because a writer that does not take the rail of
 * record must leave the other columns of that rail untouched.
 */
export interface SubscriptionClaim {
  readonly version: number;
  readonly provider: BillingProviderName;
  readonly providerSubscriptionId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly autoRenew: boolean;
  readonly cancelAtPeriodEnd: boolean;
  readonly status: SubscriptionStatus;
  readonly trialEnd: Date | null;
  readonly priceId: string | null;
  readonly productId: string | null;
  readonly customerId: string | null;
  readonly metadata: Record<string, unknown> | null;
  /** When the rail last reported this subscription. */
  readonly providerEventAt: Date | null;
}

export interface SubscriptionRepositoryPort {
  /**
   * Take the fencing token for this (user, plan) row and return its current
   * state. Returns null when no row exists yet.
   */
  claim(
    input: { userId: string; planId: string },
    options?: { executor?: BillingExecutor },
  ): Promise<SubscriptionClaim | null>;
  /**
   * Write the state, but only while the fencing token is still the claimed
   * one. Returns null when a concurrent writer superseded this one.
   */
  apply(
    input: SubscriptionWrite & { expectedVersion: number | null },
    options?: { executor?: BillingExecutor },
  ): Promise<SubscriptionWrite | null>;
  /**
   * Find the row a provider reference points at.
   *
   * A provider event does not always carry the plan, so the row itself is the
   * fallback source of truth for which plan and which customer an event
   * belongs to.
   */
  findByProviderReference(
    input: { provider: BillingProviderName; providerSubscriptionId: string },
    options?: { executor?: BillingExecutor },
  ): Promise<
    (SubscriptionClaim & { userId: string; planId: string; status: SubscriptionStatus }) | null
  >;
}

export type SubscriptionApplyOutcome =
  | { outcome: "applied"; subscription: SubscriptionWrite }
  | { outcome: "skipped"; reason: string }
  | { outcome: "superseded" };

/**
 * The window a subscription covers once a purchase is added to it.
 *
 * A purchase never shortens the coverage and never overlaps it: it adds its
 * own length to what is still covered. A purchase that continues after the
 * current coverage (a renewal) simply joins the two windows.
 */
function stackPeriod(
  claim: SubscriptionClaim,
  state: { periodStart: Date; periodEnd: Date },
): { periodStart: Date; periodEnd: Date } {
  const purchasedLength = state.periodEnd.getTime() - state.periodStart.getTime();
  if (purchasedLength <= 0) {
    // The rail reported no period, so there is nothing to add.
    return { periodStart: claim.periodStart, periodEnd: claim.periodEnd };
  }
  const overlaps = state.periodStart.getTime() < claim.periodEnd.getTime();
  if (!overlaps) {
    return {
      periodStart:
        claim.periodStart.getTime() <= state.periodStart.getTime()
          ? claim.periodStart
          : state.periodStart,
      periodEnd:
        claim.periodEnd.getTime() >= state.periodEnd.getTime() ? claim.periodEnd : state.periodEnd,
    };
  }
  // The purchase starts inside the coverage it is bought on top of, so it
  // adds its own length to the end of that coverage.
  return {
    periodStart: claim.periodStart,
    periodEnd: new Date(claim.periodEnd.getTime() + purchasedLength),
  };
}

/**
 * Is an incoming event newer than the state the row already holds?
 *
 * The rail stamps its own event time, so an event that arrives late cannot
 * overwrite a state that is already newer.
 */
function isNewerEvent(incoming: Date | null | undefined, stored: Date | null): boolean {
  if (!incoming) return true;
  if (!stored) return true;
  return incoming.getTime() >= stored.getTime();
}

/**
 * The newest event the row has seen.
 *
 * The marker never moves backwards: a late event must not make an older
 * purchase look like the newest one.
 */
function newestEvent(incoming: Date | null | undefined, stored: Date | null): Date | null {
  if (!incoming) return stored;
  if (!stored) return incoming;
  return incoming.getTime() > stored.getTime() ? incoming : stored;
}

export interface SubscriptionLifecyclePort {
  /**
   * Take the fencing token before reading provider state.
   *
   * A rail that owns the subscription (Stripe) must claim first, then fetch
   * the authoritative state, then apply it. Claiming first is what stops a
   * slow fetch from overwriting a newer cancellation.
   */
  claim(
    input: { userId: string; planId: string },
    options?: { executor?: BillingExecutor },
  ): Promise<SubscriptionClaim | null>;
  /**
   * Apply provider-authoritative state.
   *
   * `allowsRailSwitch` says whether this event is a purchase. A purchase may
   * move the subscription to another rail, because the customer paid for it
   * again. A routine state update may not: it only describes the rail that
   * already funds the subscription.
   */
  applyProviderState(input: {
    claim: SubscriptionClaim | null;
    state: Omit<SubscriptionWrite, "expectedVersion">;
    allowsRailSwitch?: boolean;
    executor?: BillingExecutor;
  }): Promise<SubscriptionApplyOutcome>;
  /**
   * Grant the period a payment bought.
   *
   * Used by rails that cannot charge again on their own: Chargily and manual
   * transfer. The period is computed from the plan and stacked onto whatever
   * coverage the customer already has.
   *
   * The caller owns the exactly-once guarantee for the payment it settles:
   * a Chargily checkout is claimed on the checkout row and a manual payment
   * on the payment row, so a duplicate delivery cannot buy a second period.
   */
  grantPaidPeriod(input: {
    userId: string;
    planId: string;
    provider: BillingProviderName;
    providerSubscriptionId: string;
    paidAt: Date;
    priceId?: string | null;
    productId?: string | null;
    customerId?: string | null;
    metadata?: Record<string, unknown> | null;
    providerEventAt?: Date | null;
    executor?: BillingExecutor;
  }): Promise<SubscriptionApplyOutcome>;
}

export function createSubscriptionLifecycle(deps: {
  repository: SubscriptionRepositoryPort;
  planCatalog: BillingPlanCatalogPort;
  /** Optional: used to stop a previous subscription from charging again. */
  canceller?: SubscriptionCanceller;
}): SubscriptionLifecyclePort {
  /**
   * Stop the subscription the customer left.
   *
   * It runs after the new state is written, so a superseded write can never
   * leave the customer with no subscription at all. A subscription that the
   * customer simply renewed is not stopped: it is the same subscription.
   */
  async function cancelPreviousRail(
    claim: SubscriptionClaim | null,
    next: { provider: BillingProviderName; providerSubscriptionId: string },
  ): Promise<void> {
    if (!deps.canceller || !claim) return;
    if (
      claim.provider === next.provider &&
      claim.providerSubscriptionId === next.providerSubscriptionId
    ) {
      return;
    }
    try {
      await deps.canceller.cancel({
        provider: claim.provider,
        providerSubscriptionId: claim.providerSubscriptionId,
      });
    } catch (error) {
      // The new rail already granted coverage. A rail that could not be
      // stopped must not undo that, but it must be visible.
      console.error(
        JSON.stringify({
          scope: "billing-subscription",
          event: "previous-subscription-cancel-failed",
          provider: claim.provider,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return {
    async claim(input, options) {
      return await deps.repository.claim(input, options);
    },

    async applyProviderState(input) {
      const claim = input.claim;
      if (claim) {
        const tracksThisSubscription =
          claim.provider === input.state.provider &&
          claim.providerSubscriptionId === input.state.providerSubscriptionId;
        if (!tracksThisSubscription && input.allowsRailSwitch !== true) {
          // The event is about a different subscription of the same customer.
          // Only a purchase may take the subscription of record over.
          return {
            outcome: "skipped",
            reason: `the subscription of record tracks ${claim.providerSubscriptionId}, not ${input.state.providerSubscriptionId}`,
          };
        }
      }
      // A purchase that is older than what the row already records still adds
      // its coverage, but it does not take the rail of record over: the newer
      // purchase is the one that renews.
      const takesTheRail =
        claim === null || isNewerEvent(input.state.providerEventAt, claim.providerEventAt);
      const providerEventAt = newestEvent(
        input.state.providerEventAt,
        claim?.providerEventAt ?? null,
      );
      const period = claim
        ? stackPeriod(claim, input.state)
        : { periodStart: input.state.periodStart, periodEnd: input.state.periodEnd };
      const written = await deps.repository.apply(
        takesTheRail
          ? {
              ...input.state,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              providerEventAt,
              expectedVersion: claim?.version ?? null,
            }
          : {
              // The rail of record stays. Only the coverage it now covers and
              // the marker of the newest event seen change.
              userId: input.state.userId,
              planId: input.state.planId,
              provider: claim?.provider ?? input.state.provider,
              providerSubscriptionId:
                claim?.providerSubscriptionId ?? input.state.providerSubscriptionId,
              status: claim?.status ?? input.state.status,
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              autoRenew: claim?.autoRenew ?? input.state.autoRenew,
              cancelAtPeriodEnd: claim?.cancelAtPeriodEnd ?? input.state.cancelAtPeriodEnd,
              trialEnd: claim?.trialEnd ?? input.state.trialEnd ?? null,
              priceId: claim?.priceId ?? input.state.priceId ?? null,
              productId: claim?.productId ?? input.state.productId ?? null,
              customerId: claim?.customerId ?? input.state.customerId ?? null,
              metadata: claim?.metadata ?? input.state.metadata ?? null,
              providerEventAt,
              expectedVersion: claim?.version ?? null,
            },
        { executor: input.executor },
      );
      if (!written) return { outcome: "superseded" };
      if (takesTheRail) {
        await cancelPreviousRail(claim, input.state);
      } else {
        console.error(
          JSON.stringify({
            scope: "billing-subscription",
            event: "stale-purchase-kept-current-rail",
            planId: input.state.planId,
            userId: input.state.userId,
            purchasedProvider: input.state.provider,
            purchasedSubscriptionId: input.state.providerSubscriptionId,
          }),
        );
      }
      return { outcome: "applied", subscription: written };
    },

    async grantPaidPeriod(input) {
      const plan = await deps.planCatalog.resolvePlan(input.planId);
      const claim = await deps.repository.claim(
        { userId: input.userId, planId: input.planId },
        { executor: input.executor },
      );
      // A purchase always adds its coverage. It only takes the rail of record
      // over when it is the newer of the two purchases.
      const takesTheRail =
        claim === null || isNewerEvent(input.providerEventAt, claim.providerEventAt);
      const providerEventAt = newestEvent(input.providerEventAt, claim?.providerEventAt ?? null);
      const period = extendBillingPeriod(
        plan,
        input.paidAt,
        claim ? { periodStart: claim.periodStart, periodEnd: claim.periodEnd } : null,
      );
      const written = await deps.repository.apply(
        takesTheRail
          ? {
              userId: input.userId,
              planId: input.planId,
              provider: input.provider,
              providerSubscriptionId: input.providerSubscriptionId,
              status: "active",
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              // Chargily and manual transfer cannot charge again without the
              // customer authorizing a new payment.
              autoRenew: false,
              cancelAtPeriodEnd: false,
              trialEnd: null,
              priceId: input.priceId ?? null,
              productId: input.productId ?? null,
              customerId: input.customerId ?? null,
              metadata: input.metadata ?? null,
              providerEventAt,
              expectedVersion: claim?.version ?? null,
            }
          : {
              // The rail of record stays. Only the coverage it now covers and
              // the marker of the newest event seen change.
              userId: input.userId,
              planId: input.planId,
              provider: claim?.provider ?? input.provider,
              providerSubscriptionId: claim?.providerSubscriptionId ?? input.providerSubscriptionId,
              status: claim?.status ?? "active",
              periodStart: period.periodStart,
              periodEnd: period.periodEnd,
              autoRenew: claim?.autoRenew ?? false,
              cancelAtPeriodEnd: claim?.cancelAtPeriodEnd ?? false,
              trialEnd: claim?.trialEnd ?? null,
              priceId: claim?.priceId ?? input.priceId ?? null,
              productId: claim?.productId ?? input.productId ?? null,
              customerId: claim?.customerId ?? input.customerId ?? null,
              metadata: claim?.metadata ?? input.metadata ?? null,
              providerEventAt,
              expectedVersion: claim?.version ?? null,
            },
        { executor: input.executor },
      );
      if (!written) return { outcome: "superseded" };
      if (takesTheRail) {
        await cancelPreviousRail(claim, input);
      } else {
        console.error(
          JSON.stringify({
            scope: "billing-subscription",
            event: "stale-purchase-kept-current-rail",
            planId: input.planId,
            userId: input.userId,
            purchasedProvider: input.provider,
            purchasedSubscriptionId: input.providerSubscriptionId,
          }),
        );
      }
      return { outcome: "applied", subscription: written };
    },
  };
}

/**
 * Stops a provider from charging again.
 *
 * Only Stripe needs this: it is the one rail that renews by itself. When a
 * customer moves to another rail, the subscription they left behind would
 * otherwise keep charging them.
 */
export interface SubscriptionCanceller {
  cancel(input: { provider: BillingProviderName; providerSubscriptionId: string }): Promise<void>;
}
