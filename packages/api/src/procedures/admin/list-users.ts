import { oc } from "@orpc/contract";
import { z } from "zod";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import type { ApiContext } from "../../context";

const adminUserSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().email(),
  role: z.enum(["user", "admin"]),
  banned: z.boolean(),
});

const contract = {
  list: oc
    .route({ method: "GET", path: "/admin/users" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Administrator access required" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      INTERNAL_SERVER_ERROR: { message: "Unable to list users" },
    })
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .output(z.object({ users: z.array(adminUserSchema), total: z.number().int().nonnegative() })),
};

export const adminListUsersContract = contract.list;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminListUsers = implementer.list.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.listUsers(input);
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
      },
      fallbackMessage: "Unable to list users",
    });
  }
});
