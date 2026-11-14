import { z } from "zod";
export function createPaymentLinkSchema(required: string) {
  return z.object({
    name: z.string().trim().min(1, required).max(120),
    planId: z.string().trim().min(1, required).max(64),
  });
}
