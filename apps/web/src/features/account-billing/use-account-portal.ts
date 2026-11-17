"use client";
import * as React from "react";
import { useOpenBillingPortal } from "./mutations";

/**
 * The portal workflow.
 *
 * A failed portal is not a dead end: the customer keeps the page and can try
 * again, while an old session that finishes after a sign-out cannot navigate.
 */
export function useAccountPortal() {
  const portal = useOpenBillingPortal();
  const [failed, setFailed] = React.useState(false);
  async function open(): Promise<void> {
    setFailed(false);
    const result = await portal.run({ origin: window.location.origin });
    if (result.status !== "success" || !result.isCurrent()) return;
    if ("url" in result.data) {
      window.location.assign(result.data.url);
      return;
    }
    setFailed(true);
  }
  return { open, failed, pending: portal.isPending };
}
