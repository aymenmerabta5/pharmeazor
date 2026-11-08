"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
const MODULES = [
  ["@repo/ui", "modules.uiDescription"],
  ["@repo/auth", "modules.authDescription"],
  ["@repo/database", "modules.databaseDescription"],
  ["@repo/billing", "modules.billingDescription"],
  ["apps/web", "modules.webDescription"],
] as const;

export function ModulesCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <section className="min-w-0 border-t pt-7">
      <h3 className="text-base font-semibold tracking-tight">{t("modules.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("modules.summary", { count: 5 })}</p>
      <div className="mt-4 divide-y">
        {MODULES.map(([name, description]) => (
          <div
            key={name}
            className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:gap-4"
          >
            <code className="font-mono text-xs leading-6">{name}</code>
            <span className="text-muted-foreground">{t(description)}</span>
            <span className="text-xs leading-6 text-muted-foreground">{t("modules.included")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
