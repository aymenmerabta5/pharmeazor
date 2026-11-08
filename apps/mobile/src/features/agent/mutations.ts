import { eveClient, type EveInvokeOptions, type EveSessionCursor } from "@/lib/eve-client";
export function invokeAgent(
  message: string,
  session: EveSessionCursor | null,
  options: EveInvokeOptions,
) {
  return eveClient.invoke(message, session, options);
}
export type { EveSessionCursor } from "@/lib/eve-client";
