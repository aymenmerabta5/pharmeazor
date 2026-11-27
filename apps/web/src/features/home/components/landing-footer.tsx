"use client";
import type * as React from "react";
import Link from "next/link";
import { BrandWordmark } from "@/components/brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";

/** The footer: the wordmark, three real destinations, and the legal line. */
export function LandingFooter({ signedIn }: { signedIn: boolean }): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const header = useSurfaceTranslations("header");
  return (
    <footer className="ph-landing-footer">
      <div className="ph-landing-wrap ph-landing-footer-inner">
        <div className="ph-landing-footer-brand">
          <BrandWordmark />
          <p>{t("footerTagline")}</p>
        </div>
        <nav className="ph-landing-footer-nav" aria-label={header("primaryNavigation")}>
          <Link href="/pricing">{t("footerPlans")}</Link>
          <Link href={signedIn ? "/settings" : "/auth/sign-in"}>
            {signedIn ? t("footerAccount") : t("footerSignIn")}
          </Link>
          <Link href="/settings/billing">{t("footerBilling")}</Link>
        </nav>
        <p className="ph-landing-footer-rights">{t("footerRights")}</p>
      </div>
    </footer>
  );
}
