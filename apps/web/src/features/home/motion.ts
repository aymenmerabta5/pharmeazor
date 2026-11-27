import type { Variants } from "motion/react";

/** One easing curve for the whole page, so nothing moves on a different note. */
export const LANDING_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const landingStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

export const landingRise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: LANDING_EASE } },
};

export const landingCardRise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: LANDING_EASE } },
};

export const landingHover = { y: -4, transition: { duration: 0.2, ease: LANDING_EASE } };
export const landingTap = { scale: 0.985 };
