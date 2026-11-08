"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

const CATEGORIES = [
  ["architecture.layerUi", "architecture.uiDescription"],
  ["architecture.layerTransport", "architecture.transportDescription"],
  ["architecture.layerApplication", "architecture.applicationDescription"],
  ["architecture.layerDomain", "architecture.domainDescription"],
  ["architecture.layerVendors", "architecture.vendorsDescription"],
  ["architecture.layerSupporting", "architecture.supportingDescription"],
] as const;

export function ArchitectureCard(): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  return (
    <section className="min-w-0 lg:col-span-7">
      <h3 className="text-base font-semibold tracking-tight">{t("architecture.title")}</h3>
      <dl className="mt-5 grid gap-x-5 gap-y-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {CATEGORIES.map(([name, description]) => (
          <div key={name} className="contents">
            <dt className="font-medium">{t(name)}</dt>
            <dd className="text-muted-foreground">{t(description)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm leading-6 text-muted-foreground">
        {t("architecture.description")}
      </p>
    </section>
  );
}
