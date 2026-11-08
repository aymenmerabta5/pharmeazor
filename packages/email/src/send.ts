import "server-only";
import * as React from "react";
import { render } from "react-email";
import { Resend } from "resend";
import { env } from "@repo/config/server";

export interface SendEmailOptions {
  from?: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export async function sendEmail<T extends object>(
  to: string | string[],
  subject: string,
  EmailComponent: React.ComponentType<T>,
  componentProps: T & React.Attributes,
  options?: SendEmailOptions,
): Promise<{ id: string }> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.includes("REPLACE_WITH")) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const html = await render(React.createElement(EmailComponent, componentProps));
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
