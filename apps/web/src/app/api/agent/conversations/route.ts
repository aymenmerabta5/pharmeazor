import { handleAgentConversationsRequest } from "@repo/api/harness";

export async function GET(request: Request): Promise<Response> {
  return await handleAgentConversationsRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return await handleAgentConversationsRequest(request);
}
