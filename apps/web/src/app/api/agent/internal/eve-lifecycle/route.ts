import { handleEveLifecycleCallback } from "@repo/api/eve";

export async function POST(request: Request): Promise<Response> {
  return await handleEveLifecycleCallback(request);
}
