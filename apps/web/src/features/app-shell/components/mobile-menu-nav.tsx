"use client";
import type * as React from "react";
import Link from "next/link";
import { useSurfaceTranslations } from "@/lib/translations";
import { cn } from "@/lib/utils";
import type { MobileMenuDestination, MobileMenuDestinations } from "../mobile-menu-model";

/**
 * Destination rows.
 *
 * The public entry points are set large, the way a native menu reads; the
 * signed-in workspace keeps the same geometry at a smaller size under its own
 * caption, so the two groups never compete.
 */
export function MobileMenuNav({
  destinations,
  onNavigate,
}: {
  destinations: MobileMenuDestinations;
  onNavigate(): void;
}): React.JSX.Element {
  const header = useSurfaceTranslations("header");
  return (
    <>
      <nav aria-label={header("primaryNavigation")} className="flex flex-col">
        {destinations.primary.map((destination) => (
          <MobileMenuLink
            key={destination.href}
            destination={destination}
            onNavigate={onNavigate}
            large
          />
        ))}
      </nav>
      {destinations.workspace.length > 0 ? (
        <nav aria-label={header("workspace")} className="mt-4 flex flex-col border-t pt-4">
          <p className="pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {header("workspace")}
          </p>
          {destinations.workspace.map((destination) => (
            <MobileMenuLink
              key={destination.href}
              destination={destination}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      ) : null}
    </>
  );
}

function MobileMenuLink({
  destination,
  onNavigate,
  large = false,
}: {
  destination: MobileMenuDestination;
  onNavigate(): void;
  large?: boolean;
}): React.JSX.Element {
  return (
    <Link
      href={destination.href}
      onClick={onNavigate}
      aria-current={destination.current ? "page" : undefined}
      className={cn(
        "ph-menu-row flex items-center rounded-lg tracking-tight transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        large ? "min-h-14 text-[28px] font-medium leading-9" : "min-h-11 text-xl leading-7",
        destination.current ? "text-primary" : "text-foreground hover:opacity-70",
      )}
    >
      {destination.label}
    </Link>
  );
}
