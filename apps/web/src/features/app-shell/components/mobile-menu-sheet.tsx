"use client";
import type * as React from "react";
import { X } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { WorkspaceIdentity } from "@/components/workspace-identity";
import { useSurfaceTranslations } from "@/lib/translations";
import type { MobileMenuDestinations } from "../mobile-menu-model";
import { MobileMenuAccount } from "./mobile-menu-account";
import { MobileMenuNav } from "./mobile-menu-nav";
import { MobileMenuPreferences } from "./mobile-menu-preferences";

/**
 * The full-screen mobile menu.
 *
 * A half-height sheet makes the visitor hunt for the row they want. This takes
 * the whole screen instead: destinations at the top, the two preference groups
 * and the account block anchored to the bottom, and the safe-area insets kept
 * off the device bars. Rows rise in sequence so the menu feels like it landed
 * rather than appeared.
 */
export function MobileMenuSheet({
  open,
  onOpenChange,
  identity,
  destinations,
  signOutPending,
  onSignOut,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  identity: WorkspaceIdentity;
  destinations: MobileMenuDestinations;
  signOutPending: boolean;
  onSignOut(): void;
}): React.JSX.Element {
  const header = useSurfaceTranslations("header");
  const common = useSurfaceTranslations("common");
  function close(): void {
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="full"
        showCloseButton={false}
        className="ph-surface ph-menu-sheet flex flex-col gap-0 overflow-hidden border-0 p-0 shadow-none"
      >
        <SheetHeader className="mx-auto w-full max-w-md shrink-0 border-b px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>
              <BrandWordmark />
            </SheetTitle>
            <SheetClose
              aria-label={common("close")}
              className="-me-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-5" aria-hidden />
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">{header("primaryNavigation")}</SheetDescription>
        </SheetHeader>

        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="pt-5">
            <MobileMenuNav destinations={destinations} onNavigate={close} />
          </div>
          <div className="mt-auto pt-10">
            <MobileMenuPreferences />
            <MobileMenuAccount
              identity={identity}
              signOutPending={signOutPending}
              onSignOut={onSignOut}
              onNavigate={close}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
