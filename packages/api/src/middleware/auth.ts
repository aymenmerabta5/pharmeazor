import { ORPCError } from "@orpc/server";
import { isAdminRole } from "@repo/auth/access";
import type { ApiContext } from "../context";
import { createCodedORPCError } from "../utils/service-error";

// oRPC middleware — Stagio pattern: protected + admin with banned check
export async function protectedProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if (ctx.user.banned)
    throw createCodedORPCError("FORBIDDEN", "ACCOUNT_SUSPENDED", { message: "Account suspended" });
  return ctx.user;
}
export async function adminProcedure(ctx: ApiContext) {
  if (!ctx.user?.id) throw new ORPCError("UNAUTHORIZED", { message: "Unauthorized" });
  if (!isAdminRole(ctx.user.role))
    throw new ORPCError("FORBIDDEN", { message: "Forbidden — admin only" });
  return ctx.user;
}
