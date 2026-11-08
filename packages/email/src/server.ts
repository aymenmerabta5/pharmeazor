import "server-only";

export { sendEmail } from "./send";
export type { SendEmailOptions } from "./send";
export { default as EmailLayout } from "./templates/EmailLayout";
export { default as VerifyEmail } from "./templates/VerifyEmail";
export { default as ResetPasswordEmail } from "./templates/ResetPassword";
export { default as WelcomeEmail } from "./templates/Welcome";
export { default as MagicLinkEmail } from "./templates/MagicLink";
export {
  EMAIL_LOCALES,
  emailDirection,
  formatTransactionalEmailMessage,
  getTransactionalEmailCopy,
  getTransactionalEmailFallbackLink,
  normalizeEmailLocale,
  resolveEmailLocale,
  transactionalEmailSubject,
} from "./locale";
export type { EmailLocale, TransactionalEmailKind } from "./locale";
export { EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_FROM_FORMATTED, RESEND_API_KEY } from "./constants";
