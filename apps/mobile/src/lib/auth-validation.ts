import { z } from "zod";

export interface EmailPasswordMessages {
  invalidEmail: string;
  passwordRequired: string;
  passwordTooShort: string;
  passwordTooLong: string;
}

export interface NameMessages {
  nameRequired: string;
  nameTooShort: string;
  nameTooLong: string;
}

function passwordSchema(
  messages: Pick<
    EmailPasswordMessages,
    "passwordRequired" | "passwordTooShort" | "passwordTooLong"
  >,
) {
  return z
    .string()
    .min(1, messages.passwordRequired)
    .min(8, messages.passwordTooShort)
    .max(64, messages.passwordTooLong);
}

export function createSignInSchema(messages: EmailPasswordMessages) {
  return z.object({
    email: z.string().trim().email(messages.invalidEmail),
    password: passwordSchema(messages),
  });
}

export function createSignUpSchema(messages: EmailPasswordMessages & NameMessages) {
  return createSignInSchema(messages).extend({
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .min(2, messages.nameTooShort)
      .max(50, messages.nameTooLong),
  });
}

export function createEmailSchema(invalidEmail: string) {
  return z.object({ email: z.string().trim().email(invalidEmail) });
}

export function createResetPasswordSchema(
  messages: Pick<
    EmailPasswordMessages,
    "passwordRequired" | "passwordTooShort" | "passwordTooLong"
  > & {
    passwordMismatch: string;
  },
) {
  return z
    .object({
      newPassword: passwordSchema(messages),
      confirmPassword: passwordSchema(messages),
    })
    .refine((value) => value.newPassword === value.confirmPassword, {
      message: messages.passwordMismatch,
      path: ["confirmPassword"],
    });
}

export function createProfileSchema(messages: NameMessages) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, messages.nameRequired)
      .min(2, messages.nameTooShort)
      .max(50, messages.nameTooLong),
  });
}

export function createChangePasswordSchema(
  messages: Pick<
    EmailPasswordMessages,
    "passwordRequired" | "passwordTooShort" | "passwordTooLong"
  > & {
    currentPasswordRequired: string;
  },
) {
  return z.object({
    currentPassword: z.string().min(1, messages.currentPasswordRequired),
    newPassword: passwordSchema(messages),
  });
}

export function createRequiredPasswordSchema(passwordRequired: string) {
  return z.object({ password: z.string().min(1, passwordRequired) });
}

export function createTotpSchema(codeSixDigits: string) {
  return z.object({ code: z.string().regex(/^[0-9]{6}$/, codeSixDigits) });
}

export function createTwoFactorChallengeSchema(
  method: "authenticator" | "backup",
  message: string,
) {
  return z.object({
    code:
      method === "backup"
        ? z.string().trim().min(1, message)
        : z.string().regex(/^[0-9]{6}$/, message),
    trustDevice: z.boolean(),
  });
}
