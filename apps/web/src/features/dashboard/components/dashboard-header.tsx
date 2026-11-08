"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

export function DashboardHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("header.title")}</h1>
        <p className="max-w-[60ch] text-sm leading-6 text-muted-foreground">
          {t("single.description")}
        </p>
      </div>
      <a
        href="#project-guide"
        className="rounded-md text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("header.setupGuide")}
      </a>
    </div>
  );
}
