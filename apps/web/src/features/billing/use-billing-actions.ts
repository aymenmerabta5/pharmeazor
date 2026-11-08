"use client";
import * as React from "react";
import { toast } from "sonner";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useBillingCheckoutMutation, useBillingPortalMutation } from "./mutations";
import type { ProviderName } from "./model";

export function useBillingActions() {
  const t = useSurfaceTranslations("billing");
  const captureOwner = useAuthOwnedEffect();
  const checkout = useBillingCheckoutMutation();
  const portal = useBillingPortalMutation();
  const navigationBusy = React.useRef(false);
  async function handleCheckout(provider: ProviderName): Promise<void> {
    if (navigationBusy.current) return;
    navigationBusy.current = true;
    try {
      const result = await checkout.run({
        provider,
        origin: window.location.origin,
        requestKey: crypto.randomUUID(),
      });
      if (result.status === "success" && result.isCurrent())
        window.location.assign(result.data.url);
      else if (result.status === "error" && result.isCurrent()) toast.error(t("checkoutError"));
    } finally {
      navigationBusy.current = false;
    }
  }
  async function handlePortal(provider: ProviderName): Promise<void> {
    if (navigationBusy.current) return;
    navigationBusy.current = true;
    try {
      const result = await portal.run({ provider, origin: window.location.origin });
      if (result.status === "success" && result.isCurrent())
        window.location.assign(result.data.url);
      else if (result.status === "error" && result.isCurrent()) toast.error(t("portalError"));
    } finally {
      navigationBusy.current = false;
    }
  }
  async function copyText(value: string): Promise<void> {
    const isCurrent = captureOwner();
    if (!isCurrent()) return;
    try {
      await navigator.clipboard.writeText(value);
      if (isCurrent()) toast.success("Copied to clipboard");
    } catch {
      if (isCurrent()) toast.error("Copy failed");
    }
  }
  return {
    handleCheckout,
    handlePortal,
    copyText,
    copySuccessUrl: () => copyText(window.location.origin),
    isCheckoutLoading: checkout.isPending || portal.isPending,
  };
}
