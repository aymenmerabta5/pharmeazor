import { handleEveFacadeRequest } from "@repo/api/eve";

export async function GET(request: Request): Promise<Response> {
  return await handleEveFacadeRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return await handleEveFacadeRequest(request);
}
