import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import {
  appRouter,
  applyApiContextResponseHeaders,
  createContext,
  rejectUnsafeOrpcRequest,
} from "@repo/api";
import { after } from "next/server";
// 15 MiB admits the 14 MiB base64 storage contract plus its JSON/oRPC envelope.
const MAX_ORPC_BODY_BYTES = 15728640;
const MAX_CONCURRENT_STORAGE_UPLOADS = 2;
const STORAGE_UPLOAD_PATHS = new Set([
  "/api/storage/upload",
  "/api/rpc/storage/upload",
  "/api/storage/objects",
  "/api/storage/objects/base64",
  "/api/rpc/storage/uploadBase64",
]);
const activeStorageUploadActors = new Set<string>();
let activeStorageUploadCount = 0;

function normalizedStorageUploadPath(request: Request): string | null {
  try {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    return pathname.replace(/[/]+$/, "") || "/";
  } catch {
    return null;
  }
}

function isStorageUploadRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  const pathname = normalizedStorageUploadPath(request);
  return pathname !== null && STORAGE_UPLOAD_PATHS.has(pathname);
}

function storageUploadActorId(context: object): string | null {
  if (
    !("storageActor" in context) ||
    typeof context.storageActor !== "object" ||
    context.storageActor === null ||
    !("id" in context.storageActor) ||
    typeof context.storageActor.id !== "string" ||
    context.storageActor.id.length === 0
  ) {
    return null;
  }
  return context.storageActor.id;
}

function isUnauthenticatedStorageUpload(request: Request, context: object): boolean {
  return isStorageUploadRequest(request) && storageUploadActorId(context) === null;
}

function acquireStorageUploadAdmission(actorId: string): (() => void) | null {
  if (
    activeStorageUploadCount >= MAX_CONCURRENT_STORAGE_UPLOADS ||
    activeStorageUploadActors.has(actorId)
  ) {
    return null;
  }
  activeStorageUploadCount += 1;
  activeStorageUploadActors.add(actorId);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeStorageUploadCount -= 1;
    activeStorageUploadActors.delete(actorId);
  };
}
function toStandardApiRequest(request: Request): Request {
  const body = request.body;
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  };
  // Node requires duplex for stream bodies. Keep the original stream unconsumed.
  if (body !== null) init.duplex = "half";
  return new Request(request.url, init);
}

const rpcHandler = new RPCHandler(appRouter, {
  plugins: [new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES })],
});
async function handle(request: Request): Promise<Response> {
  const requestBoundaryRejection = rejectUnsafeOrpcRequest(request);
  if (requestBoundaryRejection) return requestBoundaryRejection;
  const context = await createContext(request.headers);
  if (isUnauthenticatedStorageUpload(request, context)) {
    return Response.json({ error: "Authentication is required" }, { status: 401 });
  }
  const storageUploadActor = isStorageUploadRequest(request) ? storageUploadActorId(context) : null;
  const releaseStorageUploadAdmission = storageUploadActor
    ? acquireStorageUploadAdmission(storageUploadActor)
    : undefined;
  if (storageUploadActor && !releaseStorageUploadAdmission) {
    return Response.json({ error: "Upload capacity is temporarily exhausted" }, { status: 429 });
  }
  try {
    const rpcResult = await rpcHandler.handle(toStandardApiRequest(request), {
      prefix: "/api/rpc",
      context,
    });
    if (rpcResult.matched) {
      const response = applyApiContextResponseHeaders(rpcResult.response, context);
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      after(() => {
        /* analytics after response */
      });
      return response;
    }
    return new Response("Not found", { status: 404 });
  } finally {
    releaseStorageUploadAdmission?.();
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
