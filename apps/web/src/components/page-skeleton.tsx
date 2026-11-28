"use client";

import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { cn } from "@/lib/utils";

/**
 * Shared frame for route loading states.
 *
 * Every route renders the skeleton of the surface it is about to show, so the
 * first paint already has the page's shape instead of a generic loader. The
 * visible boxes are decorative; the status text is exposed to assistive
 * technology only.
 */
export function PageSkeleton({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  return (
    <div className={cn("min-w-0", className)} aria-busy="true">
      <span className="sr-only" role="status">
        {label ?? t("loading")}
      </span>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}
