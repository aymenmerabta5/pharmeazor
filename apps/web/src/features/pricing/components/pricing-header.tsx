"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSurfaceTranslations } from "@/lib/translations";

function LeafLogoSmall(): React.JSX.Element {
  return (
    <span className="ph-leaf-sm" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 3.5C10 3.5 5 5.5 5 10.5C5 13.5 7.2 16 10 16C12.8 16 15 13.5 15 10.5C15 7.5 12.5 5 10 3.5Z"
          fill="white"
          fillOpacity="0.95"
        />
        <line
          x1="10"
          y1="16"
          x2="10"
          y2="11"
          stroke="white"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Pricing header: brand lockup and the link back to the chat. */
export function PricingHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  return (
    <header className="ph-pricing-header">
      <div className="ph-pricing-header-left">
        <LeafLogoSmall />
        <span className="ph-pricing-brand">pharmeazor</span>
      </div>
      <Link href="/agent" className="ph-pricing-back">
        <ArrowLeft className="size-4" aria-hidden />
        {t("backToChat")}
      </Link>
    </header>
  );
}
