"use client";
import type * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { BookOpenCheck } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { HOME_SOURCES } from "../model";
import { landingCardRise, landingHover, landingStagger } from "../motion";

/**
 * The anatomy of an answer.
 *
 * The three cards name the source families a pharmacy answer can rest on, and
 * the strip underneath states the rule that keeps them attached: a claim
 * without a passage is not shipped.
 */
export function LandingEvidence(): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const reduced = useReducedMotion() ?? false;
  const enter = reduced ? "show" : "hidden";
  return (
    <section
      id="how-it-works"
      className="ph-landing-section ph-landing-evidence"
      aria-labelledby="landing-evidence-title"
    >
      <div className="ph-landing-wrap">
        <header className="ph-landing-section-head">
          <p className="ph-landing-eyebrow">{t("evidenceEyebrow")}</p>
          <h2 id="landing-evidence-title" className="ph-landing-heading">
            {t("evidenceTitle")}
          </h2>
          <p className="ph-landing-lead">{t("evidenceDescription")}</p>
        </header>

        <motion.div
          className="ph-landing-source-grid"
          variants={landingStagger}
          initial={enter}
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
        >
          {HOME_SOURCES.map((source, index) => (
            <motion.article
              key={source.id}
              className="ph-landing-source-card"
              variants={landingCardRise}
              whileHover={reduced ? undefined : landingHover}
            >
              <span className="ph-landing-source-index">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="ph-landing-card-title">{t(source.titleKey)}</h3>
              <p className="ph-landing-card-body">{t(source.descriptionKey)}</p>
            </motion.article>
          ))}
        </motion.div>

        <motion.p
          className="ph-landing-citation-rule"
          initial={enter}
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={landingCardRise}
        >
          <BookOpenCheck className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
          {t("counterSourceNote")}
        </motion.p>
      </div>
    </section>
  );
}
