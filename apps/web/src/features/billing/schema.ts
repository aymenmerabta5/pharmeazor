import { z } from "zod";
export function createPaymentLinkSchema(required: string) {
  return z.object({
    name: z.string().trim().min(1, required).max(120),
    price: z.string().trim().min(1, required).max(200),
  });
}
