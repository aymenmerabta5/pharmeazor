import { createHash, randomUUID } from "node:crypto";
import { verifySignature } from "@chargily/chargily-pay";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@repo/database";
import { webhook_events, checkouts, subscriptions } from "@repo/billing";
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

function providerEventMillis(...values: unknown[]): number | null {
  for (const value of values) {
    if (value instanceof Date) {
      const millis = value.getTime();
      if (Number.isFinite(millis) && millis > 0) return millis;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value) && value > 0)
      return value < 1_000_000_000_000 ? value * 1_000 : value;
    if (typeof value === "string" && value.trim()) {
      const millis = Date.parse(value);
      if (Number.isFinite(millis) && millis > 0) return millis;
    }
  }
  return null;
}

function requireProviderEventMillis(label: string, ...values: unknown[]): number {
  const millis = providerEventMillis(...values);
  if (millis === null) throw new Error(`${label} did not include a valid provider event time`);
  return millis;
}

type CheckoutStatus = typeof checkouts.$inferSelect.status;

function mapChargilyCheckoutStatus(status: string): CheckoutStatus {
  if (status === "paid" || status === "completed") return "completed";
  if (status === "failed" || status === "canceled" || status === "cancelled") return "failed";
  if (status === "expired") return "expired";
  return "pending";
}

function mapChargilyFailureEvent(eventType: string): CheckoutStatus {
  return eventType === "checkout.expired" ? "expired" : "failed";
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function chargilyDeliveryId(payload: Record<string, unknown>, rawBody: Buffer): string {
  // Chargily documents top-level id as the event id; data.id is the checkout id.
  return (
    nonEmptyString(payload.id) ??
    nonEmptyString(payload.event_id) ??
    `body_sha256:${createHash("sha256").update(rawBody).digest("hex")}`
  );
}

const CHARGILY_COMPLETED_EVENTS = new Set(["checkout.paid", "checkout.completed"]);
const CHARGILY_FAILED_EVENTS = new Set([
  "checkout.failed",
  "checkout.canceled",
  "checkout.cancelled",
  "checkout.expired",
]);
const CHARGILY_COMPLETED_STATUSES = new Set(["paid", "completed"]);
const CHARGILY_FAILED_STATUSES = new Set(["failed", "canceled", "cancelled", "expired"]);

function isChargilyCompletedEvent(eventType: string, status: string | null): boolean {
  return (
    CHARGILY_COMPLETED_EVENTS.has(eventType) &&
    (status === null || CHARGILY_COMPLETED_STATUSES.has(status))
  );
}

function isChargilyFailedEvent(eventType: string, status: string | null): boolean {
  return (
    CHARGILY_FAILED_EVENTS.has(eventType) &&
    (status === null || CHARGILY_FAILED_STATUSES.has(status))
  );
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
      provider: "chargily",
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
      eq(webhook_events.provider, "chargily"),
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
        eq(webhook_events.provider, "chargily"),
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
        eq(webhook_events.provider, "chargily"),
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
        eq(webhook_events.provider, "chargily"),
        eq(webhook_events.providerEventId, providerEventId),
        eq(webhook_events.processed, false),
        eq(webhook_events.leaseToken, leaseToken),
      ),
    )
    .returning({ id: webhook_events.id });
  if (!completed) throw new Error("Webhook delivery completion was not stored");
}

export async function POST(req: Request): Promise<Response> {
  const declaredBodyRejection = rejectDeclaredBodySize(req);
  if (declaredBodyRejection instanceof Response) return declaredBodyRejection;
  const bodyResult = await readBoundedWebhookBody(declaredBodyRejection);
  if (bodyResult instanceof Response) return bodyResult;
  const buf = bodyResult;
  const sig = req.headers.get("signature");
  if (!sig) return new Response("Missing signature header", { status: 400 });
  const secret = process.env.CHARGILY_SECRET_KEY ?? process.env.CHARGILY_WEBHOOK_SECRET ?? "";
  if (!secret || secret.startsWith("REPLACE_WITH"))
    return new Response("CHARGILY_SECRET_KEY missing - server-only", { status: 400 });
  try {
    if (!verifySignature(buf, sig, secret))
      return new Response("Invalid signature", { status: 403 });
  } catch (error) {
    logger.error(
      `[chargily webhook] signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Response("Invalid signature", { status: 403 });
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(buf.toString("utf-8")) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return new Response("Invalid webhook payload", { status: 400 });
  const data =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : payload;
  const eventId = chargilyDeliveryId(payload, buf);
  const eventType =
    nonEmptyString(payload.type) ??
    nonEmptyString(payload.event) ??
    `checkout.${nonEmptyString(data.status) ?? "updated"}`;
  const eventOccurredAtMs = providerEventMillis(
    payload.created_at,
    payload.createdAt,
    data.created_at,
    data.updated_at,
    data.createdAt,
    data.updatedAt,
  );
  let claim: ClaimResult;
  try {
    claim = await claimWebhookDelivery(eventId, eventType, payload);
  } catch (error) {
    logger.error(
      `[chargily webhook] delivery claim failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Response("Idempotency store unavailable", {
      status: 500,
      headers: { "Retry-After": "60" },
    });
  }
  if (claim.status === "completed") return new Response("already processed", { status: 200 });
  if (claim.status === "in_flight")
    return new Response("delivery in progress", { status: 503, headers: { "Retry-After": "5" } });
  try {
    const status = nonEmptyString(data.status) ?? nonEmptyString(payload.status);
    const checkoutId = nonEmptyString(data.id);
    const completed = isChargilyCompletedEvent(eventType, status);
    const failed = isChargilyFailedEvent(eventType, status);
    if ((completed || failed) && !checkoutId)
      throw new Error(`Chargily ${eventType} event did not include data.id`);
    if (checkoutId && (completed || failed || status)) {
      const metadata = (data.metadata ?? payload.metadata) as Record<string, unknown> | undefined;
      const existingCheckout = await db.query.checkouts.findFirst({
        where: and(
          eq(checkouts.provider, "chargily"),
          eq(checkouts.providerCheckoutId, checkoutId),
        ),
      });
      const userId =
        nonEmptyString(metadata?.userId) ??
        nonEmptyString(metadata?.chargily_user_id) ??
        existingCheckout?.userId ??
        null;
      if (!userId) throw new Error(`Chargily ${eventType} event did not include actor ownership`);
      const requestKey = nonEmptyString(metadata?.requestKey);
      const providerEventAt = new Date(
        requireProviderEventMillis(`Chargily ${eventType}`, eventOccurredAtMs),
      );
      const checkoutStatus = completed
        ? ("completed" as const)
        : failed
          ? mapChargilyFailureEvent(eventType)
          : mapChargilyCheckoutStatus(status ?? "pending");
      if (requestKey)
        await db
          .update(checkouts)
          .set({
            providerCheckoutId: checkoutId,
            status: checkoutStatus,
            metadata,
            providerEventAt,
            creationState: "ready",
            creationStartedAt: null,
            creationLeaseToken: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(checkouts.userId, userId),
              eq(checkouts.provider, "chargily"),
              eq(checkouts.requestKey, requestKey),
              eq(checkouts.creationState, "creating"),
            ),
          );
      const [stored] = await db
        .insert(checkouts)
        .values({
          userId,
          provider: "chargily",
          providerCheckoutId: checkoutId,
          requestKey,
          status: checkoutStatus,
          metadata,
          providerEventAt,
        })
        .onConflictDoUpdate({
          target: [checkouts.provider, checkouts.providerCheckoutId],
          set: {
            requestKey,
            status: checkoutStatus,
            metadata,
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
      if (!stored && existingCheckout?.userId !== userId)
        throw new Error(`Chargily checkout ${checkoutId} belongs to another actor`);
      if (completed || failed) {
        const subscriptionStatus = completed
          ? ("active" as const)
          : eventType === "checkout.expired"
            ? ("expired" as const)
            : ("canceled" as const);
        await db
          .insert(subscriptions)
          .values({
            userId,
            provider: "chargily",
            providerSubscriptionId: checkoutId,
            status: subscriptionStatus,
            metadata,
            providerEventAt,
          })
          .onConflictDoUpdate({
            target: [subscriptions.provider, subscriptions.providerSubscriptionId],
            set: { status: subscriptionStatus, metadata, providerEventAt, updatedAt: new Date() },
            setWhere: and(
              eq(subscriptions.userId, userId),
              sql`${subscriptions.providerEventAt} IS NULL OR ${subscriptions.providerEventAt} < ${providerEventAt} OR (${subscriptions.providerEventAt} = ${providerEventAt} AND (${subscriptionStatus} IN ('canceled', 'expired') OR ${subscriptions.status} NOT IN ('canceled', 'expired')))`,
            ),
          });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[chargily webhook] handler failed: ${message}`);
    try {
      await failWebhookDelivery(eventId, claim.leaseToken, message);
    } catch (releaseError) {
      logger.error(
        `[chargily webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
    return new Response("Webhook handler failed", {
      status: 500,
      headers: { "Retry-After": "60" },
    });
  }
  try {
    await completeWebhookDelivery(eventId, claim.leaseToken);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[chargily webhook] completion failed: ${message}`);
    try {
      await failWebhookDelivery(eventId, claim.leaseToken, message);
    } catch (releaseError) {
      logger.error(
        `[chargily webhook] claim release failed: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
    return new Response("Webhook event store unavailable", {
      status: 500,
      headers: { "Retry-After": "60" },
    });
  }
  logger.info(`[chargily webhook] processed ${eventType} ${eventId}`);
  return new Response("ok", { status: 200 });
}
