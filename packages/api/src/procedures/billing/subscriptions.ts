import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import { z } from "zod";
import type { ApiContext } from "../../context";

const contract = {
  list: oc
    .route({ method: "GET", path: "/billing/subscriptions" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Account suspended or unverified" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      INTERNAL_SERVER_ERROR: { message: "Unable to load billing data" },
    })
    .output(
      z.object({
        subscriptions: z.array(z.record(z.string(), z.unknown())),
        invoices: z.array(z.record(z.string(), z.unknown())),
        usageEvents: z.array(z.record(z.string(), z.unknown())),
        licenseKeys: z.array(z.record(z.string(), z.unknown())),
      }),
    ),
};

export const billingSubscriptionsContract = contract.list;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingSubscriptions = implementer.list.handler(async ({ context }) => {
  try {
    return await context.application.billing.subscriptions();
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
      fallbackMessage: "Unable to load billing data",
    });
  }
});
