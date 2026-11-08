import BorderClassic from "./BorderClassic";
import BorderFormal from "./BorderFormal";
import BorderMinimal from "./BorderMinimal";
import BorderModern from "./BorderModern";
import BorderOrnate from "./BorderOrnate";
import BorderPremium from "./BorderPremium";

export const borderComponents = {
  classic: BorderClassic,
  formal: BorderFormal,
  minimal: BorderMinimal,
  modern: BorderModern,
  ornate: BorderOrnate,
  premium: BorderPremium,
} as const;

export type BorderStyleKey = keyof typeof borderComponents;
