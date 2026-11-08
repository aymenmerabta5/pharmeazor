import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context";

// Pure oRPC only - oc.route + implement + authenticated context auth.api.getSession

const contract = {
  me: oc.route({ method: "GET", path: "/me" }).output(
    z.object({
      user: z
        .object({
          id: z.string(),
          email: z.string(),
          name: z.string().nullable(),
          role: z.string().nullable(),
          banned: z.boolean(),
        })
        .nullable(),
      sessionId: z.string().nullable(),
      activeOrganizationId: z.string().nullable(),
      activeTeamId: z.string().nullable(),
    }),
  ),
};

export const meContract = contract.me;

const implementer = implement<typeof contract, ApiContext>(contract);

export const me = implementer.me.handler(async ({ context }) => {
  return await context.application.me();
});
