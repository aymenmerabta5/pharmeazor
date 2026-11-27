"use client";
import type * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { landingRise } from "../motion";

/** The closing statement: one promise and one action. */
export function LandingClose(): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const reduced = useReducedMotion() ?? false;
  const enter = reduced ? "show" : "hidden";
  return (
    <section className="ph-landing-section ph-landing-close" aria-labelledby="landing-close-title">
      <motion.div
        className="ph-landing-wrap ph-landing-close-inner"
        initial={enter}
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        variants={landingRise}
      >
        <p className="ph-landing-eyebrow">{t("closeEyebrow")}</p>
        <h2 id="landing-close-title" className="ph-landing-heading ph-landing-close-title">
          {t("closeTitle")}
        </h2>
        <p className="ph-landing-lead">{t("closeDescription")}</p>
        <Link href="/pricing" className="ph-landing-button ph-landing-button-primary">
          {t("closePrimary")}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </motion.div>
    </section>
  );
}
