"use client";
import * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { mobileMenuDestinations } from "./mobile-menu-model";
import { useAppShell } from "./use-app-shell";

/**
 * Disclosure, destinations and the sign-out handoff for the mobile menu.
 *
 * The sheet is a presentation concern; keeping the state machine here lets the
 * composition file render typed actions only.
 */
export function useMobileMenu() {
  const header = useSurfaceTranslations("header");
  const plans = useSurfaceTranslations("pricing");
  const { identity, pathname, onSignOut } = useAppShell();
  const destinations = mobileMenuDestinations({ identity, pathname, header, plans });
  const [open, setOpen] = React.useState(false);
  const [signOutPending, setSignOutPending] = React.useState(false);
  const openMenu = React.useCallback(() => setOpen(true), []);
  const changeOpen = React.useCallback((next: boolean) => setOpen(next), []);
  const signOut = React.useCallback(async () => {
    setSignOutPending(true);
    try {
      setOpen(false);
      await onSignOut();
    } finally {
      setSignOutPending(false);
    }
  }, [onSignOut]);

  return {
    header,
    identity,
    destinations,
    open,
    openMenu,
    changeOpen,
    signOut,
    signOutPending,
  };
}
