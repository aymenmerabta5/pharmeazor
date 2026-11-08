import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context";

// Pure oRPC only - oc.route per Context7 /dinwwwh/orpc
const contract = {
  health: oc
    .route({ method: "GET", path: "/health" })
    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),
};

export const healthContract = contract.health;

const implementer = implement<typeof contract, ApiContext>(contract);

export const health = implementer.health.handler(async () => ({
  status: "ok" as const,
  time: new Date().toISOString(),
}));
