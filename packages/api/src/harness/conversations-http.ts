import "server-only";
import { resolveAuthenticatedEveActor, type AuthenticatedEveActor } from "./actor";
import {
  ensureAgentConversationTitle,
  listAgentConversations,
  type AgentConversationOwner,
} from "./conversations";
import { configuredBrowserOrigin, hasTrustedBrowserOrigin } from "./policy";
import { isValidEveSessionId } from "@repo/services/harness";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_PROMPT_CHARS = 8_000;

function privateResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { ok: false, code, error: message },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        Pragma: "no-cache",
        Vary: "Cookie, Origin",
      },
    },
  );
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return null;
  const source = await request.text();
  if (source.length > MAX_BODY_BYTES) return null;
  try {
    const value: unknown = JSON.parse(source);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function ownerOf(actor: AuthenticatedEveActor): AgentConversationOwner {
  return {
    organizationId: actor.organizationId,
    teamId: actor.teamId,
    userId: actor.userId,
  };
}

export async function handleAgentConversationsRequest(request: Request): Promise<Response> {
  const browserOrigin = configuredBrowserOrigin();
  if (!browserOrigin) {
    return privateResponse(503, "auth_not_configured", "Authentication is not configured.");
  }
  if (!hasTrustedBrowserOrigin(request, browserOrigin)) {
    return privateResponse(403, "invalid_origin", "The request origin is not trusted.");
  }

  let actor: AuthenticatedEveActor | null;
  try {
    actor = await resolveAuthenticatedEveActor(new Headers(request.headers));
  } catch {
    return privateResponse(503, "identity_unavailable", "Identity verification is unavailable.");
  }
  if (!actor) return privateResponse(401, "authentication_required", "Sign in to continue.");
  if (!actor.emailVerified) {
    return privateResponse(
      403,
      "email_verification_required",
      "Verify your email address to use Eve.",
    );
  }
  const owner = ownerOf(actor);

  if (request.method === "GET") {
    try {
      return Response.json(
        { conversations: await listAgentConversations(owner) },
        { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Origin" } },
      );
    } catch {
      return privateResponse(
        503,
        "conversations_unavailable",
        "Conversation history is unavailable.",
      );
    }
  }

  if (request.method !== "POST") {
    return privateResponse(405, "method_not_allowed", "Method not allowed.");
  }

  const body = await readBody(request);
  if (!body) return privateResponse(400, "invalid_json", "Expected a JSON object.");
  const eveSessionId = typeof body.eveSessionId === "string" ? body.eveSessionId : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!isValidEveSessionId(eveSessionId)) {
    return privateResponse(400, "invalid_session", "A valid session id is required.");
  }
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return privateResponse(400, "invalid_prompt", "A first prompt is required.");
  }

  try {
    const conversation = await ensureAgentConversationTitle({ owner, eveSessionId, prompt });
    if (!conversation)
      return privateResponse(404, "conversation_not_found", "Conversation not found.");
    return Response.json(
      { conversation },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Origin" } },
    );
  } catch {
    return privateResponse(
      503,
      "conversations_unavailable",
      "Conversation history is unavailable.",
    );
  }
}
