import { handleEveLifecycleCallback } from "@repo/api/harness";

export async function POST(request: Request): Promise<Response> {
  return await handleEveLifecycleCallback(request);
}
