"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "@repo/services/application";

const provider = z.enum(["stripe", "chargily"]);
const portalProvider = z.literal("stripe");
const paymentLinkProvider = z.literal("chargily");
const origin = z
  .string()
  .url()
  .transform((value) => new URL(value).origin);
const checkoutInput = z.object({
  provider,
  origin,
  requestKey: z.string().uuid(),
  planId: z.string().min(1).max(64),
});
const portalInput = z.object({ provider: portalProvider, origin });
const paymentLinkInput = z.object({
  provider: paymentLinkProvider,
  name: z.string().trim().min(1).max(120),
  planId: z.string().trim().min(1).max(64),
});

async function application() {
  return createRequestApplicationForRequest(new Headers(await headers()));
}

export async function createBillingCheckoutAction(input: unknown) {
  const parsed = checkoutInput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid checkout input");
  const result = await (
    await application()
  ).billing.createCheckout({
    provider: parsed.data.provider,
    planId: parsed.data.planId,
    successUrl: parsed.data.origin + "/billing/success",
    failureUrl: parsed.data.origin + "/billing/cancel",
    requestKey: parsed.data.requestKey,
  });
  revalidatePath("/billing");
  return result;
}

export async function createBillingPortalAction(input: unknown) {
  const parsed = portalInput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid portal input");
  const result = await (
    await application()
  ).billing.createPortalSession({
    provider: parsed.data.provider,
    returnUrl: parsed.data.origin + "/billing",
  });
  revalidatePath("/billing");
  return result;
}

export async function createBillingPaymentLinkAction(input: unknown) {
  const parsed = paymentLinkInput.safeParse(input);
  if (!parsed.success) throw new Error("Invalid payment-link input");
  return await (
    await application()
  ).billing.createPaymentLink({
    provider: parsed.data.provider,
    planId: parsed.data.planId,
    name: parsed.data.name,
  });
}
