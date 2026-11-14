import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import { z } from "zod";
import type { ApiContext } from "../../context";

const contract = {
  createPaymentLink: oc
    .route({ method: "POST", path: "/billing/payment-link" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Merchant administrator required" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      NOT_IMPLEMENTED: { message: "Payment links are not supported" },
      INTERNAL_SERVER_ERROR: { message: "Failed to create payment link" },
    })
    .input(
      z.object({
        provider: z.literal("chargily"),
        planId: z.string().min(1).max(64),
        name: z.string().min(1).max(120),
        quantity: z.number().int().min(1).max(1_000).optional(),
        afterCompletionMessage: z.string().max(500).optional(),
      }),
    )
    .output(z.object({ id: z.string(), url: z.string().url() })),
};

export const billingCreatePaymentLinkContract = contract.createPaymentLink;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreatePaymentLink = implementer.createPaymentLink.handler(
  async ({ input, context }) => {
    try {
      return await context.application.billing.createPaymentLink(input);
    } catch (error) {
      return createServiceORPCError(error, {
        codeMap: {
          APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED",
          APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN",
          APPLICATION_EMAIL_NOT_VERIFIED: "FORBIDDEN",
          APPLICATION_ADMIN_REQUIRED: "FORBIDDEN",
          APPLICATION_BAD_REQUEST: "BAD_REQUEST",
          APPLICATION_NOT_FOUND: "NOT_FOUND",
          APPLICATION_NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
          APPLICATION_CONFLICT: "CONFLICT",
          APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS",
          APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
          APPLICATION_INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
        },
        fallbackMessage: "Failed to create payment link",
      });
    }
  },
);
