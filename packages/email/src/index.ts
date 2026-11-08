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
