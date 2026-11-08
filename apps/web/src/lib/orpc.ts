import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

const RPC_PATH = "/api/rpc";

function browserRpcUrl(): URL {
  if (typeof window === "undefined") {
    throw new Error(
      "The shared oRPC client is browser-only. Next Server Components and Server Actions use the request application facade.",
    );
  }
  return new URL(RPC_PATH, window.location.origin);
}

const link = new RPCLink({ url: browserRpcUrl });

export const orpcClient = createORPCClient<RouterClient<typeof appRouter>>(link);
export const orpc = createORPCReactQueryUtils(orpcClient);
export type ApiClient = typeof orpcClient;
