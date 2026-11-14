import Stripe from "stripe";
import type { SubscriptionStatus } from "@repo/billing";
import { stripeSubscriptionPeriod } from "@repo/billing/providers/stripe";
import {
  billingPlanCatalog,
  billingSubscriptionRepository,
  subscriptionLifecycle,
} from "@repo/services/billing/server";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@repo/database";
import { webhook_events, checkouts, invoices, customers } from "@repo/billing";
import { logger } from "@repo/observability";

const MAX_WEBHOOK_BODY_BYTES = 1048576;

function payloadTooLarge(): Response {
  return new Response("Webhook payload too large", { status: 413 });
}

function rejectDeclaredBodySize(request: Request): Request | Response {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalizedLength = contentLength.trim();
    if (!/^\d+$/.test(normalizedLength)) {
      return new Response("Invalid Content-Length", { status: 400 });
    }
    const declaredBytes = Number(normalizedLength);
    if (!Number.isSafeInteger(declaredBytes)) return payloadTooLarge();
    if (declaredBytes > MAX_WEBHOOK_BODY_BYTES) return payloadTooLarge();
  }
  return request;
}

async function readBoundedWebhookBody(request: Request): Promise<Buffer | Response> {
  const body = request.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (totalBytes + value.byteLength > MAX_WEBHOOK_BODY_BYTES) {
        try {
          await reader.cancel("Webhook payload too large");
        } catch {}
        return payloadTooLarge();
      }
      chunks.push(value);
      totalBytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const result = Buffer.allocUnsafe(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

type ExpandableId = string | { id: string } | null | undefined;

function expandableId(value: ExpandableId): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function stripeProviderSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "past_due":
      return "past_due";
    case "paused":
      return "paused";
    case "trialing":
      return "trialing";
    case "unpaid":
      return "unpaid";
    default:
      return "incomplete";
  }
}

function stripeCheckoutSubscriptionStatus(
  paymentStatus: Stripe.Checkout.Session.PaymentStatus,
  subscriptionStatus: Stripe.Subscription.Status,
): SubscriptionStatus {
  const safeStatus = stripeProviderSubscriptionStatus(subscriptionStatus);
  if (safeStatus === "active")
    return paymentStatus === "paid"
      ? "active"
      : paymentStatus === "unpaid"
        ? "unpaid"
        : "incomplete";
  if (safeStatus === "trialing")
    return paymentStatus === "paid" || paymentStatus === "no_payment_required"
      ? "trialing"
      : "unpaid";
  return safeStatus;
}

function stripeCheckoutStatus(
  paymentStatus: Stripe.Checkout.Session.PaymentStatus,
): "completed" | "pending" {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required"
    ? "completed"
    : "pending";
}

type WebhookPayload = NonNullable<typeof webhook_events.$inferInsert.payload>;
type ClaimResult =
  | { status: "claimed"; leaseToken: string }
  | { status: "completed" }
  | { status: "in_flight" };
const WEBHOOK_LEASE_MS = 5 * 60 * 1_000;

async function claimWebhookDelivery(
  providerEventId: string,
  type: string,
  payload: WebhookPayload,
): Promise<ClaimResult> {
  const now = new Date();
  const leaseToken = randomUUID();
  const [inserted] = await db
    .insert(webhook_events)
    .values({
      provider: "stripe",
      providerEventId,
      type,
      payload,
      processed: false,
      attemptCount: 1,
      processingStartedAt: now,
      leaseToken,
    })
    .onConflictDoNothing({ target: [webhook_events.provider, webhook_events.providerEventId] })
    .returning({ leaseToken: webhook_events.leaseToken });
  if (inserted?.leaseToken) return { status: "claimed", leaseToken: inserted.leaseToken };
  const existing = await db.query.webhook_events.findFirst({
    where: and(
      eq(webhook_events.provider, "stripe"),
      eq(webhook_events.providerEventId, providerEventId),
    ),
  });
  if (existing?.processed) return { status: "completed" };
  if (!existing) throw new Error("Webhook delivery claim disappeared");
  if (
    existing.processingStartedAt &&
    existing.processingStartedAt.getTime() > now.getTime() - WEBHOOK_LEASE_MS
  )
    return { status: "in_flight" };
  // CAS the persisted owner token (and its timestamp) so exactly one stale-worker reclaim wins.
  const leaseOwnerGuard = existing.leaseToken
    ? eq(webhook_events.leaseToken, existing.leaseToken)
    : isNull(webhook_events.leaseToken);
  const leaseTimeGuard = existing.processingStartedAt
    ? eq(webhook_events.processingStartedAt, existing.processingStartedAt)
    : isNull(webhook_events.processingStartedAt);
  const [reclaimed] = await db
    .update(webhook_events)
    .set({
      type,
      payload,
      processingStartedAt: now,
      leaseToken,
      lastError: null,
      attemptCount: sql`${webhook_events.attemptCount} + 1`,
    })
    .where(
      and(
        eq(webhook_events.provider, "stripe"),
        eq(webhook_events.providerEventId, providerEventId),
        eq(webhook_events.processed, false),
        leaseOwnerGuard,
        leaseTimeGuard,
      ),
    )
    .returning({ leaseToken: webhook_events.leaseToken });
  return reclaimed?.leaseToken
    ? { status: "claimed", leaseToken: reclaimed.leaseToken }
    : { status: "in_flight" };
}

async function failWebhookDelivery(
  providerEventId: string,
  leaseToken: string,
  error: string,
): Promise<void> {
  await db
    .update(webhook_events)
    .set({ processingStartedAt: null, leaseToken: null, lastError: error.slice(0, 2_000) })
    .where(
      and(
        eq(webhook_events.provider, "stripe"),
        eq(webhook_events.providerEventId, providerEventId),
        eq(webhook_events.processed, false),
        eq(webhook_events.leaseToken, leaseToken),
      ),
    );
}

async function completeWebhookDelivery(providerEventId: string, leaseToken: string): Promise<void> {
  const [completed] = await db
    .update(webhook_events)
    .set({
      processed: true,
      processedAt: new Date(),
      processingStartedAt: null,
      leaseToken: null,
      lastError: null,
    })
    .where(
      and(
        eq(webhook_events.provider, "stripe"),
        eq(webhook_events.providerEventId, providerEventId),
        eq(webhook_events.processed, false),
        eq(webhook_events.leaseToken, leaseToken),
      ),
    )
    .returning({ id: webhook_events.id });
  if (!completed) throw new Error("Webhook delivery completion was not stored");
}

/**
 * The subscription row a Stripe event belongs to.
 *
 * A Stripe event does not always carry the plan, so the row itself is the
 * fallback source of truth for which plan and which customer an event
 * belongs to. The price id on the subscription is the last resort.
 */
async function resolveStripeSubscriptionTarget(input: {
  providerSubscriptionId: string;
  userId?: string | null;
  planId?: string | null;
  providerPriceId?: string | null;
  existing?: Awaited<ReturnType<typeof billingSubscriptionRepository.findByProviderReference>>;
}): Promise<{ userId: string; planId: string }> {
  const existing =
    input.existing ??
    (await billingSubscriptionRepository.findByProviderReference({
      provider: "stripe",
      providerSubscriptionId: input.providerSubscriptionId,
    }));
  const userId = input.userId?.trim() || existing?.userId;
  if (!userId) {
    throw new Error(
      `Stripe subscription ${input.providerSubscriptionId} does not identify a customer`,
    );
  }
  const planId =
    existing?.planId ||
    input.planId?.trim() ||
    (input.providerPriceId
      ? await billingPlanCatalog.resolvePlanIdByProviderPrice({
          provider: "stripe",
          providerPriceId: input.providerPriceId,
        })
      : null);
  if (!planId) {
    throw new Error(`Stripe subscription ${input.providerSubscriptionId} does not identify a plan`);
  }
  return { userId, planId };
}

function stripeSubscriptionPriceId(subscription: Stripe.Subscription): string | undefined {
  return subscription.items.data[0]?.price?.id ?? undefined;
}

/**
 * Reconcile a Stripe subscription into the one subscription row.
 *
 * The fencing token is claimed before the remote read. A concurrent
 * cancellation claims a newer version, so this response cannot resurrect
 * access that was already revoked.
 */
async function synchronizeStripeSubscription(
  stripe: Stripe,
  providerSubscriptionId: string,
  providerEventAt: Date,
  hints: {
    userId?: string | null;
    planId?: string | null;
    providerPriceId?: string | null;
  },
  outcome?: {
    status?: SubscriptionStatus;
    /** The checkout payment status, used to refine the subscription status. */
    paymentStatus?: Stripe.Checkout.Session.PaymentStatus;
    periodStart?: Date;
    periodEnd?: Date;
    autoRenew?: boolean;
    cancelAtPeriodEnd?: boolean;
    trialEnd?: Date | null;
    metadata?: Record<string, unknown> | null;
    /**
     * True when the event is a purchase. A purchase may move the
     * subscription to the Stripe rail; a routine state update may not.
     */
    allowsRailSwitch?: boolean;
  },
): Promise<{ userId: string; planId: string }> {
  const target = await resolveStripeSubscriptionTarget({
    providerSubscriptionId,
    ...hints,
  });
  const claim = await subscriptionLifecycle.claim(target);
  const authoritative = await stripe.subscriptions.retrieve(providerSubscriptionId);
  const providerUserId = authoritative.metadata.userId;
  if (providerUserId && providerUserId !== target.userId) {
    throw new Error(`Stripe subscription ${providerSubscriptionId} provider ownership changed`);
  }
  const period = stripeSubscriptionPeriod(authoritative);
  const status =
    outcome?.status ??
    (outcome?.paymentStatus
      ? stripeCheckoutSubscriptionStatus(outcome.paymentStatus, authoritative.status)
      : stripeProviderSubscriptionStatus(authoritative.status));
  const applied = await subscriptionLifecycle.applyProviderState({
    claim,
    allowsRailSwitch: outcome?.allowsRailSwitch === true,
    state: {
      userId: target.userId,
      planId: target.planId,
      provider: "stripe",
      providerSubscriptionId,
      status,
      periodStart: outcome?.periodStart ?? period.start,
      periodEnd: outcome?.periodEnd ?? period.end,
      // Stripe charges the customer again by itself, so it renews unless the
      // customer asked to stop at the end of the period.
      autoRenew: outcome?.autoRenew ?? !authoritative.cancel_at_period_end,
      cancelAtPeriodEnd: outcome?.cancelAtPeriodEnd ?? authoritative.cancel_at_period_end,
      trialEnd:
        outcome?.trialEnd ??
        (authoritative.trial_end ? new Date(authoritative.trial_end * 1000) : null),
      metadata: outcome?.metadata ?? authoritative.metadata,
      providerEventAt,
    },
  });
  if (applied.outcome === "superseded") {
    throw new Error(`Stripe subscription ${providerSubscriptionId} reconciliation was superseded`);
  }
  if (applied.outcome === "skipped") {
    logger.info(`[stripe webhook] skipped ${providerSubscriptionId}: ${applied.reason}`);
  }
  return target;
}

/**
 * Apply a cancellation without reading Stripe again.
 *
 * A canceled subscription is not always retrievable, so the event payload is
 * the authority for this transition.
 */
async function cancelStripeSubscription(
  providerSubscriptionId: string,
  providerEventAt: Date,
  hints: {
    userId?: string | null;
    planId?: string | null;
    providerPriceId?: string | null;
    periodStart?: Date;
    periodEnd?: Date;
    metadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  const target = await resolveStripeSubscriptionTarget({
    providerSubscriptionId,
    ...hints,
  });
  const claim = await subscriptionLifecycle.claim(target);
  const applied = await subscriptionLifecycle.applyProviderState({
    claim,
    state: {
      userId: target.userId,
      planId: target.planId,
      provider: "stripe",
      providerSubscriptionId,
      status: "canceled",
      periodStart: hints.periodStart ?? claim?.periodStart ?? providerEventAt,
      periodEnd: hints.periodEnd ?? claim?.periodEnd ?? providerEventAt,
      autoRenew: false,
      cancelAtPeriodEnd: false,
      trialEnd: null,
      metadata: hints.metadata ?? null,
      providerEventAt,
    },
  });
  if (applied.outcome === "superseded") {
    throw new Error(`Stripe subscription ${providerSubscriptionId} cancellation was superseded`);
  }
  if (applied.outcome === "skipped") {
    logger.info(`[stripe webhook] skipped ${providerSubscriptionId}: ${applied.reason}`);
  }
}

function stripeInvoiceValues(
  invoice: Stripe.Invoice,
  providerEventAt: Date,
  userId: string,
): typeof invoices.$inferInsert {
  const customerId = expandableId(invoice.customer);
  const subscriptionId = expandableId(invoice.parent?.subscription_details?.subscription);
  return {
    userId,
    provider: "stripe",
    providerInvoiceId: invoice.id,
    paid: true,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: "paid",
    providerEventAt,
    hostedUrl: invoice.hosted_invoice_url ?? null,
    metadata: {
      ...invoice.metadata,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    },
  };
}

async function storeStripeInvoice(
  invoice: Stripe.Invoice,
  providerEventAt: Date,
  userId: string,
): Promise<void> {
  const values = stripeInvoiceValues(invoice, providerEventAt, userId);
  const [stored] = await db
    .insert(invoices)
    .values(values)
    .onConflictDoUpdate({
      target: [invoices.provider, invoices.providerInvoiceId],
      set: values,
      setWhere: and(
        eq(invoices.userId, userId),
        sql`${invoices.providerEventAt} IS NULL OR ${invoices.providerEventAt} <= ${providerEventAt}`,
      ),
    })
    .returning({ id: invoices.id });
  if (stored) return;
  const existing = await db.query.invoices.findFirst({
    where: and(eq(invoices.provider, "stripe"), eq(invoices.providerInvoiceId, invoice.id)),
  });
  if (!existing || existing.userId !== userId)
    throw new Error(`Stripe invoice ${invoice.id} belongs to another actor`);
}

async function synchronizeStripeCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  providerEventAt: Date,
  forcedCheckoutStatus?: "completed" | "failed",
  forcedPaymentStatus?: Stripe.Checkout.Session.PaymentStatus,
): Promise<void> {
  const paymentStatus = forcedPaymentStatus ?? session.payment_status;
  const checkoutStatus = forcedCheckoutStatus ?? stripeCheckoutStatus(paymentStatus);
  const subscriptionId = expandableId(session.subscription);
  let userId = session.metadata?.userId ?? session.client_reference_id;
  const requestKey = session.metadata?.requestKey;
  if (userId && requestKey)
    await db
      .update(checkouts)
      .set({
        providerCheckoutId: session.id,
        status: checkoutStatus,
        url: session.url,
        amount: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        providerEventAt,
        creationState: "ready",
        creationStartedAt: null,
        creationLeaseToken: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(checkouts.userId, userId),
          eq(checkouts.provider, "stripe"),
          eq(checkouts.requestKey, requestKey),
          eq(checkouts.creationState, "creating"),
        ),
      );
  const existingCheckout = await db.query.checkouts.findFirst({
    where: and(eq(checkouts.provider, "stripe"), eq(checkouts.providerCheckoutId, session.id)),
  });
  userId = userId ?? existingCheckout?.userId ?? null;
  if (!userId) return; // A provider-account checkout not created by this application.
  const [storedCheckout] = await db
    .insert(checkouts)
    .values({
      userId,
      provider: "stripe",
      providerCheckoutId: session.id,
      requestKey,
      status: checkoutStatus,
      url: session.url,
      amount: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
      providerEventAt,
    })
    .onConflictDoUpdate({
      target: [checkouts.provider, checkouts.providerCheckoutId],
      set: {
        requestKey,
        status: checkoutStatus,
        url: session.url,
        amount: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        providerEventAt,
        creationState: "ready",
        creationStartedAt: null,
        creationLeaseToken: null,
        updatedAt: new Date(),
      },
      setWhere: and(
        eq(checkouts.userId, userId),
        sql`${checkouts.providerEventAt} IS NULL OR ${checkouts.providerEventAt} <= ${providerEventAt}`,
      ),
    })
    .returning({ id: checkouts.id });
  if (!storedCheckout && existingCheckout?.userId !== userId)
    throw new Error(`Stripe checkout ${session.id} belongs to another actor`);
  const providerCustomerId = expandableId(session.customer);
  if (providerCustomerId && userId) {
    await db
      .insert(customers)
      .values({
        userId,
        provider: "stripe",
        providerCustomerId,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        metadata: session.metadata,
      })
      .onConflictDoUpdate({
        target: [customers.userId, customers.provider],
        set: {
          email: session.customer_details?.email ?? session.customer_email ?? null,
          metadata: session.metadata,
          updatedAt: new Date(),
        },
      });
  }
  if (!subscriptionId || !userId) return;
  // Only a completed payment may touch the subscription of record. A
  // checkout that needs more authentication has not bought anything, and it
  // must not take over a live subscription the customer already pays for.
  const paid = paymentStatus === "paid" || paymentStatus === "no_payment_required";
  if (!paid) {
    logger.info(
      `[stripe webhook] checkout ${session.id} has not completed (${paymentStatus}); the subscription of record is untouched`,
    );
    return;
  }
  await synchronizeStripeSubscription(
    stripe,
    subscriptionId,
    providerEventAt,
    {
      userId,
      planId: session.metadata?.planId ?? null,
    },
    { paymentStatus, allowsRailSwitch: true },
  );
}

export async function POST(req: Request): Promise<Response> {
  const declaredBodyRejection = rejectDeclaredBodySize(req);
  if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
  const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);
  if (bodyResult instanceof Response) return bodyResult;
  const buf = bodyResult;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || stripeSecretKey.startsWith("REPLACE_WITH")) {
    logger.warn("[stripe webhook] not configured — set server-only env var");
    return new Response("STRIPE_SECRET_KEY is not configured", { status: 400 });
  }
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeWebhookSecret || stripeWebhookSecret.startsWith("REPLACE_WITH")) {
    logger.warn("[stripe webhook] webhook secret is not configured");
    return new Response("STRIPE_WEBHOOK_SECRET is not configured", { status: 400 });
  }
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2026-08-26.dahlia" });
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // CRITICAL: buf contains the exact raw bytes; never parse before signature verification.

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(buf, sig, stripeWebhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `[stripe webhook] signature verification failed (403 invalid signature): ${message}`,
    );
    return new Response("Webhook Error", { status: 403 });
  }

  // Atomic composite (provider, providerEventId) claim before any side effects.
  let claim: ClaimResult;
  try {
    claim = await claimWebhookDelivery(event.id, event.type, { ...event });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[stripe webhook] idempotency check failed: ${message}`);
    return new Response("Idempotency store unavailable", {
      status: 500,
      headers: { "Retry-After": "60" },
    });
  }
  if (claim.status === "completed") return new Response("already processed", { status: 200 });
  if (claim.status === "in_flight")
    return new Response("delivery in progress", { status: 503, headers: { "Retry-After": "5" } });

  try {
    const providerEventAt = new Date(event.created * 1000);
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await synchronizeStripeCheckoutSession(stripe, session, providerEventAt);
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        await synchronizeStripeCheckoutSession(
          stripe,
          session,
          providerEventAt,
          "completed",
          "paid",
        );
        break;
      }
      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        await synchronizeStripeCheckoutSession(
          stripe,
          session,
          providerEventAt,
          "failed",
          "unpaid",
        );
        break;
      }
      // invoice.paid lifecycle broader vs payment_succeeded narrower: broader = subscription+invoice lifecycle, narrower = payment attempt only
      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = expandableId(invoice.parent?.subscription_details?.subscription);
        if (!subscriptionId)
          throw new Error(`Stripe invoice ${invoice.id} did not include a subscription`);
        // Claim a monotonic fence before the remote read. A concurrent delete
        // claims a newer version, so this response cannot resurrect access.
        const target = await synchronizeStripeSubscription(
          stripe,
          subscriptionId,
          providerEventAt,
          {
            userId: invoice.metadata?.userId ?? null,
            planId: invoice.metadata?.planId ?? null,
          },
          { allowsRailSwitch: false },
        );
        await storeStripeInvoice(invoice, providerEventAt, target.userId);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = expandableId(invoice.parent?.subscription_details?.subscription);
        if (!subscriptionId)
          throw new Error(`Stripe invoice ${invoice.id} did not include a subscription`);
        const existing = await billingSubscriptionRepository.findByProviderReference({
          provider: "stripe",
          providerSubscriptionId: subscriptionId,
        });
        const userId =
          existing?.userId ?? (await stripe.subscriptions.retrieve(subscriptionId)).metadata.userId;
        if (!userId)
          throw new Error(
            `Stripe invoice ${invoice.id} subscription did not include actor ownership`,
          );
        await storeStripeInvoice(invoice, providerEventAt, userId);
        break;
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object;
        logger.info(
          `[stripe webhook] payment intent ${intent.id} succeeded for ${intent.amount_received} ${intent.currency}`,
        );
        break;
      }
      case "charge.succeeded": {
        const charge = event.data.object;
        logger.info(
          `[stripe webhook] charge ${charge.id} succeeded for ${charge.amount_captured} ${charge.currency}`,
        );
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        // Fence before fetching so concurrent cancellation invalidates this reader.
        await synchronizeStripeSubscription(stripe, subscription.id, providerEventAt, {
          userId: subscription.metadata?.userId ?? null,
          planId: subscription.metadata?.planId ?? null,
          providerPriceId: stripeSubscriptionPriceId(subscription),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const period =
          subscription.items.data.length > 0 ? stripeSubscriptionPeriod(subscription) : null;
        await cancelStripeSubscription(subscription.id, providerEventAt, {
          userId: subscription.metadata?.userId ?? null,
          planId: subscription.metadata?.planId ?? null,
          providerPriceId: stripeSubscriptionPriceId(subscription),
          periodStart: period?.start,
          periodEnd: period?.end,
          metadata: subscription.metadata,
        });
        break;
      }
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[stripe webhook] handler error: ${message}`);
    try {
      await failWebhookDelivery(event.id, claim.leaseToken, message);
    } catch (releaseError) {
      logger.error(
        `[stripe webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
    return new Response("Webhook handler failed", {
      status: 500,
      headers: { "Retry-After": "60" },
    });
  }

  try {
    await completeWebhookDelivery(event.id, claim.leaseToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[stripe webhook] failed to record webhook event: ${message}`);
    try {
      await failWebhookDelivery(event.id, claim.leaseToken, message);
    } catch (releaseError) {
      logger.error(
        `[stripe webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
    return new Response("Webhook event store unavailable", {
      status: 500,
      headers: { "Retry-After": "60" },
    });
  }

  logger.info(`[stripe webhook] processed ${event.type} ${event.id}`);
  return new Response("ok", { status: 200 });
}
