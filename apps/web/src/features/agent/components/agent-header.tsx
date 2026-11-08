"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { useSurfaceTranslations } from "@/lib/translations";

export function AgentHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <Badge variant="secondary">{t("durableBadge")}</Badge>
      </div>
      <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("webDescription")}</p>
    </div>
  );
}
