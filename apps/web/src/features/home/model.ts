/** Landing-page content: the questions, sources, and limits the page names. */
import type { SurfaceMessageKey } from "@/lib/translations";

export type HomeCopyKey = SurfaceMessageKey<"home">;

export interface HomeSource {
  readonly id: string;
  readonly titleKey: HomeCopyKey;
  readonly descriptionKey: HomeCopyKey;
}

/** The three source families a pharmacy answer can rest on. */
export const HOME_SOURCES: readonly HomeSource[] = [
  {
    id: "registry",
    titleKey: "evidenceRegistryTitle",
    descriptionKey: "evidenceRegistryDescription",
  },
  {
    id: "notice",
    titleKey: "evidenceNoticeTitle",
    descriptionKey: "evidenceNoticeDescription",
  },
  {
    id: "interactions",
    titleKey: "evidenceInteractionTitle",
    descriptionKey: "evidenceInteractionDescription",
  },
];

export interface HomeQuestion {
  readonly id: string;
  readonly titleKey: HomeCopyKey;
  readonly questionKey: HomeCopyKey;
  readonly answerKey: HomeCopyKey;
}

/** The three counter questions the page uses as proof of the product. */
export const HOME_QUESTIONS: readonly HomeQuestion[] = [
  {
    id: "interactions",
    titleKey: "counterInteractionsTitle",
    questionKey: "counterInteractionsQuestion",
    answerKey: "counterInteractionsAnswer",
  },
  {
    id: "equivalents",
    titleKey: "counterEquivalentsTitle",
    questionKey: "counterEquivalentsQuestion",
    answerKey: "counterEquivalentsAnswer",
  },
  {
    id: "dosage",
    titleKey: "counterDosageTitle",
    questionKey: "counterDosageQuestion",
    answerKey: "counterDosageAnswer",
  },
];

export interface HomeLimit {
  readonly id: string;
  readonly titleKey: HomeCopyKey;
  readonly descriptionKey: HomeCopyKey;
}

/** The boundaries the assistant states before it answers. */
export const HOME_LIMITS: readonly HomeLimit[] = [
  {
    id: "sources",
    titleKey: "scopeRuleOneTitle",
    descriptionKey: "scopeRuleOneDescription",
  },
  {
    id: "patients",
    titleKey: "scopeRuleTwoTitle",
    descriptionKey: "scopeRuleTwoDescription",
  },
  {
    id: "disagreement",
    titleKey: "scopeRuleThreeTitle",
    descriptionKey: "scopeRuleThreeDescription",
  },
];
