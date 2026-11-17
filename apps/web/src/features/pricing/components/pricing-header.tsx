"use client";
import type * as React from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand-wordmark";
import {
  SurfaceHeaderControls,
  type SurfaceHeaderControlsProps,
} from "@/features/app-shell/components/surface-header-controls";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * Pricing header: brand lockup, the link back to the chat and the controls.
 *
 * The account and its actions arrive from the pricing container, which owns
 * the shell workflow.
 */
export function PricingHeader({
  identity,
  onNavigate,
  onSignOut,
}: Omit<SurfaceHeaderControlsProps, "menuClassName">): React.JSX.Element {
  const t = useSurfaceTranslations("pricing");
  return (
    <header className="ph-pricing-header">
      <div className="ph-pricing-header-left">
        <BrandWordmark />
      </div>
      <div className="ph-pricing-header-right">
        <Link href="/" className="ph-pricing-back">
          <ArrowLeft className="size-4" aria-hidden />
          {t("backToChat")}
        </Link>
        <SurfaceHeaderControls
          identity={identity}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          menuClassName="ph-menu-trigger"
        />
      </div>
    </header>
  );
}
