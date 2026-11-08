import { oc } from "@orpc/contract";
import { z } from "zod";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import type { ApiContext } from "../../context";

const contract = {
  changeRole: oc
    .route({ method: "PATCH", path: "/admin/users/{userId}/role" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Role change forbidden" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      NOT_FOUND: { message: "User not found" },
      CONFLICT: { message: "The user changed concurrently" },
    })
    .input(z.object({ userId: z.string().min(1), role: z.enum(["user", "admin"]) }))
    .output(z.object({ id: z.string(), role: z.enum(["user", "admin"]) })),
};

export const adminChangeRoleContract = contract.changeRole;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminChangeRole = implementer.changeRole.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.changeRole(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: {
        APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED",
        APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN",
        APPLICATION_ADMIN_REQUIRED: "FORBIDDEN",
        APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS",
        APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE",
        ADMIN_FORBIDDEN: "FORBIDDEN",
        ADMIN_ACTOR_BANNED: "FORBIDDEN",
        ADMIN_SELF_ACTION: "FORBIDDEN",
        ADMIN_LAST_ADMIN: "FORBIDDEN",
        ADMIN_USER_NOT_FOUND: "NOT_FOUND",
        ADMIN_CONCURRENT_MODIFICATION: "CONFLICT",
      },
      fallbackMessage: "Unable to change role",
    });
  }
});
