import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import { z } from "zod";
import type { ApiContext } from "../../context";

const contract = {
  createPortalSession: oc
    .route({ method: "POST", path: "/billing/portal" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Account suspended or unverified" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      BAD_REQUEST: { message: "Invalid portal return URL" },
      NOT_FOUND: { message: "Billing customer not found" },
      NOT_IMPLEMENTED: { message: "Customer portal not supported" },
      INTERNAL_SERVER_ERROR: { message: "Failed to create portal session" },
    })
    .input(
      z.object({
        provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
        returnUrl: z.string().url(),
      }),
    )
    .output(z.object({ url: z.string() })),
};

export const billingCreatePortalSessionContract = contract.createPortalSession;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreatePortalSession = implementer.createPortalSession.handler(
  async ({ input, context }) => {
    try {
      return await context.application.billing.createPortalSession(input);
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
          NOT_SUPPORTED: "NOT_IMPLEMENTED",
          CUSTOMER_NOT_FOUND: "NOT_FOUND",
          INVALID_REDIRECT: "BAD_REQUEST",
        },
        fallbackMessage: "Failed to create portal session",
      });
    }
  },
);
