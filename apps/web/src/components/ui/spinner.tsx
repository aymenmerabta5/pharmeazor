"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { useSurfaceTranslations } from "../../lib/translations";

export function Spinner({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const t = useSurfaceTranslations("common");
  return (
    <div
      role="status"
      aria-label={t("loading")}
      data-slot="spinner"
      className={cn(
        "size-4 rounded-full border-2 border-current border-e-transparent motion-safe:animate-spin",
        className,
      )}
      {...props}
    >
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
