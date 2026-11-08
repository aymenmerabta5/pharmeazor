import {
  createRequestApplicationForRequest,
  type RequestApplication,
} from "@repo/services/application";

export interface ApiContext {
  headers: Headers;
  application: RequestApplication;
  user?: {
    id: string;
    identityId?: string;
    email: string;
    emailVerified: boolean;
    name?: string | null;
    role?: string | null;
    banned?: boolean | null;
  };
  sessionId?: string;
  identityActor?: import("@repo/services/identity").IdentityActor | null;
  storageActor?: import("@repo/services/storage").StorageActor | null;
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const application = await createRequestApplicationForRequest(headers);
  const principal = application.principal;
  if (!principal) return { headers, application };
  const user = {
    id: principal.userId,
    identityId: principal.identityUserId,
    email: principal.email,
    emailVerified: principal.emailVerified,
    name: principal.name,
    role: principal.role,
    banned: principal.banned,
  };
  const sessionId = principal.sessionId;
  const authenticatedAt = principal.authenticatedAt;
  const activeOrganizationId = principal.activeOrganizationId;
  const activeTeamId = principal.activeTeamId;
  return {
    headers,
    application,
    user,
    sessionId,
    identityActor:
      !user.banned && authenticatedAt
        ? {
            userId: user.id,
            sessionId,
            email: user.email,
            emailVerified: user.emailVerified,
            authenticatedAt,
            activeOrganizationId,
            activeTeamId,
          }
        : null,
    storageActor: user.banned ? null : { id: user.id, banned: false },
  };
}

export function requireUser(ctx: ApiContext) {
  if (!ctx.user?.id) throw new Error("UNAUTHORIZED");
  if (ctx.user.banned) throw new Error("ACCOUNT_SUSPENDED");
  return ctx.user;
}

export function requireAdmin(ctx: ApiContext) {
  const user = requireUser(ctx);
  if (user.role !== "admin" && user.role !== "superAdmin") throw new Error("FORBIDDEN");
  return user;
}

export function applyApiContextResponseHeaders(response: Response, context: ApiContext): Response {
  const cookie = Reflect.get(context, "featureFlagSetCookie");
  if (typeof cookie !== "string" || cookie.length === 0) return response;
  response.headers.append("Set-Cookie", cookie);
  response.headers.set("Cache-Control", "private, no-store");
  const vary = new Set(
    (response.headers.get("Vary") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  vary.add("Cookie");
  response.headers.set("Vary", [...vary].join(", "));
  return response;
}
