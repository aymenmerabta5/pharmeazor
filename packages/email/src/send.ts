import "server-only";
import * as React from "react";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { render } from "react-email";
import { Resend } from "resend";
import { env } from "@repo/config/server";

export interface SendEmailOptions {
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

/**
 * Local development has no mail provider. Persist the rendered message under
 * the ignored Next.js build directory so its verification or reset link can be
 * opened without a hosted inbox. Production still requires Resend.
 */
async function writeDevelopmentEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const directory = join(process.cwd(), ".next", "dev-emails");
  const id = "dev-" + Date.now().toString(36);
  const file = join(directory, id + ".html");
  await mkdir(directory, { recursive: true });
  await writeFile(file, input.html, "utf8");
  const recipient = Array.isArray(input.to) ? input.to.join(", ") : input.to;
  console.info("[dev-email] " + input.subject + " -> " + recipient + " (open " + file + ")");
  return { id };
}

export async function sendEmail<T extends object>(
  to: string | string[],
  subject: string,
  EmailComponent: React.ComponentType<T>,
  componentProps: T & React.Attributes,
  options?: SendEmailOptions,
): Promise<{ id: string }> {
  const html = await render(React.createElement(EmailComponent, componentProps));
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.includes("REPLACE_WITH")) {
    if (env.NODE_ENV === "development") {
      return await writeDevelopmentEmail({ to, subject, html });
    }
    throw new Error("RESEND_API_KEY is not configured");
  }
  const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({
    from: options?.from ?? env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    replyTo: options?.replyTo,
    cc: options?.cc,
    bcc: options?.bcc,
  });
  if (error) throw new Error(error.message ?? "Email delivery failed");
  if (!data?.id) throw new Error("Email provider returned no delivery ID");
  return { id: data.id };
}
