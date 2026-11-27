"use client";
import type * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { HOME_LIMITS } from "../model";
import { landingCardRise, landingHover, landingStagger } from "../motion";

/**
 * The limits band.
 *
 * A pharmacy assistant earns trust by stating what it will not do. The one
 * dark band on the page carries that statement, so it reads as a commitment
 * rather than another feature list.
 */
export function LandingScope(): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  const reduced = useReducedMotion() ?? false;
  const enter = reduced ? "show" : "hidden";
  return (
    <section className="ph-landing-section ph-landing-scope" aria-labelledby="landing-scope-title">
      <div className="ph-landing-wrap ph-landing-scope-grid">
        <header className="ph-landing-scope-copy">
          <p className="ph-landing-eyebrow">{t("scopeEyebrow")}</p>
          <h2 id="landing-scope-title" className="ph-landing-heading">
            {t("scopeTitle")}
          </h2>
          <p className="ph-landing-lead">{t("scopeDescription")}</p>
        </header>

        <motion.ul
          className="ph-landing-scope-rules"
          variants={landingStagger}
          initial={enter}
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
        >
          {HOME_LIMITS.map((limit) => (
            <motion.li
              key={limit.id}
              className="ph-landing-scope-rule"
              variants={landingCardRise}
              whileHover={reduced ? undefined : landingHover}
            >
              <ShieldCheck className="mt-0.5 size-5 shrink-0" strokeWidth={1.8} aria-hidden />
              <div>
                <h3 className="ph-landing-scope-rule-title">{t(limit.titleKey)}</h3>
                <p className="ph-landing-scope-rule-body">{t(limit.descriptionKey)}</p>
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
