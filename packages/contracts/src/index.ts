export { BILLING_PLAN_IDS } from "./billing";
export type { BillingPlanId } from "./billing";

export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
