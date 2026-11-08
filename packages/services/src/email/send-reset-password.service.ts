import "server-only";
import type { Result } from "@repo/kernel";
import { err, ok } from "@repo/kernel";
export interface SendResetPasswordInput {
  email: string;
  resetUrl: string;
}
export interface EmailProviderPort {
  sendEmail(to: string, subject: string, html: string): Promise<{ id: string }>;
}
export interface SendResetPasswordDeps {
  emailProvider: EmailProviderPort;
}
export type SendResetPasswordOutput = Result<{ emailId: string }, Error>;
export async function sendResetPasswordEmailService(
  input: SendResetPasswordInput,
  deps: SendResetPasswordDeps,
): Promise<SendResetPasswordOutput> {
  try {
    const result = await deps.emailProvider.sendEmail(
      input.email,
      "Reset password",
      `<a href="${input.resetUrl}">Reset</a>`,
    );
    return ok({ emailId: result.id });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
