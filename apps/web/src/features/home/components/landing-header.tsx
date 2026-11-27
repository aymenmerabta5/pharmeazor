"use client";
import type * as React from "react";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand-wordmark";
import {
  SurfaceHeaderControls,
  type SurfaceHeaderControlsProps,
} from "@/features/app-shell/components/surface-header-controls";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * The public header.
 *
 * The two anchors are the only page navigation; the language, appearance, and
 * account controls come from the shared shell so the landing page behaves like
 * the rest of the application. The shell workflow is composed by the feature
 * container, so this view only lays the controls out.
 */
export function LandingHeader({
  identity,
  onNavigate,
  onSignOut,
}: Pick<SurfaceHeaderControlsProps, "identity" | "onNavigate" | "onSignOut">): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const header = useSurfaceTranslations("header");
  return (
    <header className="ph-landing-header">
      <div className="ph-landing-header-inner">
        <Link href="/" className="ph-landing-brand" aria-label="pharmeazor">
          <BrandWordmark />
        </Link>
        <nav className="ph-landing-nav" aria-label={header("primaryNavigation")}>
          <a className="ph-landing-nav-link" href="#how-it-works">
            {t("navHowItWorks")}
          </a>
          <a className="ph-landing-nav-link" href="#plans">
            {t("navPlans")}
          </a>
        </nav>
        <div className="ph-landing-header-actions">
          <SurfaceHeaderControls
            identity={identity}
            onNavigate={onNavigate}
            onSignOut={onSignOut}
            menuClassName="ph-menu-trigger"
          />
        </div>
      </div>
    </header>
  );
}
