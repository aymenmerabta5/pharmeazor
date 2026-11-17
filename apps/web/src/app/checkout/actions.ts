"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "@repo/services/application";

const origin = z
  .string()
  .url()
  .transform((value) => new URL(value).origin);
const checkoutInput = z.object({
  rail: z.enum(["stripe", "chargily"]),
  planId: z.string().min(1).max(64),
  origin,
  requestKey: z.string().uuid(),
});
const portalInput = z.object({ origin });
const balanceInput = z.object({
  planId: z.string().min(1).max(64),
  requestKey: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});

async function application() {
  return createRequestApplicationForRequest(new Headers(await headers()));
}

/**
 * A provider checkout that could not start.
 *
 * `RAIL_UNAVAILABLE` is the honest answer when the rail is not provisioned
 * yet: the catalog sells the plan, but this rail has no price id or API key, so
 * asking the customer to retry a different card is pointless. Everything else
 * is a transient request failure the customer can retry.
 */
export type CheckoutFailure = "RAIL_UNAVAILABLE" | "REQUEST_FAILED";

function failureCode(error: unknown): CheckoutFailure {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (
      current.message.startsWith("BILLING_PRICE_NOT_PROVISIONED") ||
      current.message.startsWith("BILLING_PRICE_NOT_FOUND") ||
      current.message.includes("is not configured")
    )
      return "RAIL_UNAVAILABLE";
    current = current.cause;
  }
  return "REQUEST_FAILED";
}

export async function createCheckoutAction(
  input: unknown,
): Promise<{ url: string } | { failure: CheckoutFailure }> {
  const parsed = checkoutInput.safeParse(input);
  if (!parsed.success) return { failure: "REQUEST_FAILED" };
  try {
    const result = await (
      await application()
    ).billing.createCheckout({
      provider: parsed.data.rail,
      planId: parsed.data.planId,
      successUrl: parsed.data.origin + "/checkout/success",
      failureUrl: parsed.data.origin + "/checkout/cancel",
      requestKey: parsed.data.requestKey,
    });
    revalidatePath("/settings/billing");
    return { url: result.url };
  } catch (error) {
    return { failure: failureCode(error) };
  }
}

export async function createPortalAction(
  input: unknown,
): Promise<{ url: string } | { failure: CheckoutFailure }> {
  const parsed = portalInput.safeParse(input);
  if (!parsed.success) return { failure: "REQUEST_FAILED" };
  try {
    const result = await (
      await application()
    ).billing.createPortalSession({
      provider: "stripe",
      returnUrl: parsed.data.origin + "/settings/billing",
    });
    revalidatePath("/settings/billing");
    return { url: result.url };
  } catch (error) {
    return { failure: failureCode(error) };
  }
}

/**
 * Why a balance purchase did not happen.
 *
 * `INSUFFICIENT_FUNDS` is a normal outcome, not an error: the customer needs a
 * top-up before this plan is affordable. `PLAN_UNAVAILABLE` means the catalog
 * has no DZD price for the plan, which no retry can fix.
 */
export type BalancePurchaseFailure = "INSUFFICIENT_FUNDS" | "PLAN_UNAVAILABLE" | "REQUEST_FAILED";

function balanceFailureCode(error: unknown): BalancePurchaseFailure {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (code === "APPLICATION_INSUFFICIENT_FUNDS" || code === "INSUFFICIENT_FUNDS")
      return "INSUFFICIENT_FUNDS";
    if (code === "NOT_CONFIGURED" || current.message.startsWith("BILLING_PRICE_NOT_FOUND"))
      return "PLAN_UNAVAILABLE";
    current = current.cause;
  }
  return "REQUEST_FAILED";
}

/**
 * Buy one period of a plan with the wallet balance.
 *
 * The plan and a replay key are the only client inputs: the amount is resolved
 * server-side, so the browser cannot decide what a plan costs.
 */
export async function payWithBalanceAction(
  input: unknown,
): Promise<{ periodEnd: string | null } | { failure: BalancePurchaseFailure }> {
  const parsed = balanceInput.safeParse(input);
  if (!parsed.success) return { failure: "REQUEST_FAILED" };
  try {
    const result = await (
      await application()
    ).billing.purchaseWithBalance({
      planId: parsed.data.planId,
      requestKey: parsed.data.requestKey,
    });
    revalidatePath("/settings/billing");
    revalidatePath("/pricing");
    return { periodEnd: result.periodEnd };
  } catch (error) {
    return { failure: balanceFailureCode(error) };
  }
}
