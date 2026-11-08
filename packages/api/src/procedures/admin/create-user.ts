import { oc } from "@orpc/contract";
import { z } from "zod";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error";
import type { ApiContext } from "../../context";

const contract = {
  create: oc
    .route({ method: "POST", path: "/admin/users" })
    .errors({
      UNAUTHORIZED: { message: "Authentication required" },
      FORBIDDEN: { message: "Administrator access required" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      BAD_REQUEST: { message: "Unable to create user" },
    })
    .input(
      z.object({
        name: z.string().trim().min(1).max(80),
        email: z.string().email(),
        password: z.string().min(8).max(128),
        role: z.enum(["user", "admin"]),
      }),
    )
    .output(
      z.object({
        id: z.string(),
        name: z.string().nullable(),
        email: z.string().email(),
        role: z.enum(["user", "admin"]),
        banned: z.boolean(),
      }),
    ),
};

export const adminCreateUserContract = contract.create;
const implementer = implement<typeof contract, ApiContext>(contract);

export const adminCreateUser = implementer.create.handler(async ({ context, input }) => {
  try {
    return await context.application.admin.createUser(input);
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
      fallbackMessage: "Unable to create user",
      fallbackCode: "BAD_REQUEST",
    });
  }
});
