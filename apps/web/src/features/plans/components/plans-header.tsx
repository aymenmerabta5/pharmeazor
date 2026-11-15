"use client";
import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";

export function PlansHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("plans");
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 py-6">
      <Link
        href="/agent"
        className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label="pharmeazor"
      >
        <BrandWordmark size="large" />
      </Link>
      <Link
        href="/agent"
        className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToChat")}
      </Link>
    </header>
  );
}
