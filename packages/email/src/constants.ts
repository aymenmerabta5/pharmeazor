import "server-only";
import { env } from "@repo/config/server";

export const EMAIL_FROM = env.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = env.EMAIL_FROM_NAME ?? env.APP_NAME ?? "GhostInit";
export const EMAIL_FROM_FORMATTED = `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`;
export const RESEND_API_KEY = env.RESEND_API_KEY;
