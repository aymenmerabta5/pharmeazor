"use client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { safeBillingProviderUrl } from "./provider-url";
import type { ProviderName } from "./model";
interface PortalInput {
  provider: ProviderName;
  origin: string;
}
interface CheckoutInput extends PortalInput {
  requestKey: string;
}
interface PaymentLinkInput {
  provider: ProviderName;
  name: string;
  price: string;
}
import {
  createBillingCheckoutAction,
  createBillingPortalAction,
  createBillingPaymentLinkAction,
} from "@/app/billing/actions";
const createCheckout = (input: CheckoutInput) => createBillingCheckoutAction(input);
const createPortal = (input: PortalInput) => createBillingPortalAction(input);
const createPaymentLink = (input: PaymentLinkInput) => createBillingPaymentLinkAction(input);
export function useBillingCheckoutMutation() {
  return useAuthOwnedMutation(async (input: CheckoutInput) => {
    const result = await createCheckout(input);
    return { ...result, url: safeBillingProviderUrl(result.url) };
  });
}
export function useBillingPortalMutation() {
  return useAuthOwnedMutation(async (input: PortalInput) => {
    const result = await createPortal(input);
    return { ...result, url: safeBillingProviderUrl(result.url) };
  });
}
export function useBillingPaymentLinkMutation() {
  return useAuthOwnedMutation(async (input: PaymentLinkInput) => {
    const result = await createPaymentLink(input);
    return { ...result, url: safeBillingProviderUrl(result.url) };
  });
}
