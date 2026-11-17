"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobileMenuSheet } from "./components/mobile-menu-sheet";
import { useMobileMenu } from "./use-mobile-menu";

/**
 * A three-line mark with a shorter middle rule.
 *
 * The stock hamburger reads as a placeholder at this size. Shortening the
 * centre line keeps the menu legible while giving the trigger the same quiet,
 * typographic rhythm as the wordmark beside it. The glyph is symmetric, so it
 * needs no mirroring under RTL.
 */
function MenuGlyph(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 6h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 10h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The public mobile menu: one trigger, one sheet.
 *
 * The language selector, theme control, account entry points and workspace
 * destinations used to compete for width in the top bar. They now live one tap
 * away in a sheet that gives every row a full-size target, and the bar keeps
 * only the wordmark and this trigger.
 */
export function MobileMenu({ className }: { className?: string }): React.JSX.Element {
  const menu = useMobileMenu();

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("shrink-0", className)}
        aria-label={menu.header("openNavigation")}
        aria-haspopup="dialog"
        aria-expanded={menu.open}
        onClick={menu.openMenu}
      >
        <MenuGlyph />
      </Button>
      <MobileMenuSheet
        open={menu.open}
        onOpenChange={menu.changeOpen}
        identity={menu.identity}
        destinations={menu.destinations}
        signOutPending={menu.signOutPending}
        onSignOut={menu.signOut}
      />
    </>
  );
}
