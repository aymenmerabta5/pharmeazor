import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import { z } from "zod";
import type { ApiContext } from "../../context";

const contract = {
  createCheckout: oc
    .route({ method: "POST", path: "/billing/checkout" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Account suspended or unverified" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      BAD_REQUEST: { message: "Invalid checkout input" },
      INTERNAL_SERVER_ERROR: { message: "Failed to create checkout" },
    })
    .input(
      z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        planId: z.literal("pro"),
        successUrl: z.string().url(),
        failureUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
        quantity: z.number().int().min(1).max(1_000).optional(),
        requestKey: z.string().uuid(),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        url: z.string(),
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        status: z.string(),
      }),
    ),
};

export const billingCreateCheckoutContract = contract.createCheckout;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreateCheckout = implementer.createCheckout.handler(
  async ({ input, context }) => {
    try {
      return await context.application.billing.createCheckout(input);
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
        fallbackMessage: "Failed to create checkout",
      });
    }
  },
);
