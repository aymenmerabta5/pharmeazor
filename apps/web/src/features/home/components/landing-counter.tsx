"use client";
import type * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { useSurfaceTranslations } from "@/lib/translations";
import { HOME_QUESTIONS } from "../model";
import { landingCardRise, landingHover, landingStagger } from "../motion";

/**
 * The counter questions.
 *
 * Each card is a real question with the shape of the answer under it. The
 * cards are not feature names; they are the work the assistant is asked to do.
 */
export function LandingCounter(): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const reduced = useReducedMotion() ?? false;
  const enter = reduced ? "show" : "hidden";
  return (
    <section
      className="ph-landing-section ph-landing-counter"
      aria-labelledby="landing-counter-title"
    >
      <div className="ph-landing-wrap">
        <header className="ph-landing-section-head">
          <p className="ph-landing-eyebrow">{t("counterEyebrow")}</p>
          <h2 id="landing-counter-title" className="ph-landing-heading">
            {t("counterTitle")}
          </h2>
          <p className="ph-landing-lead">{t("counterDescription")}</p>
        </header>

        <motion.div
          className="ph-landing-question-grid"
          variants={landingStagger}
          initial={enter}
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
        >
          {HOME_QUESTIONS.map((question, index) => (
            <motion.article
              key={question.id}
              className="ph-landing-question-card"
              variants={landingCardRise}
              whileHover={reduced ? undefined : landingHover}
            >
              <span className="ph-landing-question-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="ph-landing-card-title">{t(question.titleKey)}</h3>
              <p className="ph-landing-question-ask">{t(question.questionKey)}</p>
              <p className="ph-landing-question-answer">{t(question.answerKey)}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
