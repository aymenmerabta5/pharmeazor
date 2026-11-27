"use client";
import type * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { landingRise, landingStagger } from "../motion";
import { LandingAnswerPreview } from "./landing-answer-preview";

/**
 * The first screen.
 *
 * One sentence says what the product is and for whom, one sentence says how it
 * behaves, and the product itself sits beside them. The copy rises in sequence
 * once on load; the answer card follows a beat later.
 */
export function LandingHero({ signedIn }: { signedIn: boolean }): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const reduced = useReducedMotion() ?? false;
  const enter = reduced ? "show" : "hidden";
  return (
    <section className="ph-landing-section ph-landing-hero" aria-labelledby="landing-hero-title">
      <div className="ph-landing-wrap ph-landing-hero-grid">
        <motion.div
          className="ph-landing-hero-copy"
          variants={landingStagger}
          initial={enter}
          animate="show"
        >
          <motion.p variants={landingRise} className="ph-landing-eyebrow">
            {t("heroEyebrow")}
          </motion.p>
          <motion.h1 variants={landingRise} id="landing-hero-title" className="ph-landing-title">
            {t("heroTitle")}
          </motion.h1>
          <motion.p variants={landingRise} className="ph-landing-lead">
            {t("heroDescription")}
          </motion.p>
          <motion.div variants={landingRise} className="ph-landing-hero-actions">
            <Link href="/pricing" className="ph-landing-button ph-landing-button-primary">
              {t("heroPrimary")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href={signedIn ? "/settings" : "/auth/sign-in"}
              className="ph-landing-button ph-landing-button-secondary"
            >
              {signedIn ? t("heroSignedInSecondary") : t("heroSecondary")}
            </Link>
          </motion.div>
          <motion.p variants={landingRise} className="ph-landing-hero-note">
            <ShieldCheck className="size-4" strokeWidth={2} aria-hidden />
            {t("heroNote")}
          </motion.p>
        </motion.div>

        <motion.div
          className="ph-landing-hero-visual"
          initial={enter}
          animate="show"
          variants={landingRise}
          transition={{ delay: 0.12 }}
        >
          <LandingAnswerPreview />
        </motion.div>
      </div>
    </section>
  );
}
