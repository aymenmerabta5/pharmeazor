import { NextRequest, NextResponse } from "next/server";
import {
  MAINTENANCE_COOKIE,
  MAINTENANCE_COOKIE_TTL_SECONDS,
  isMaintenanceSecretConfigured,
  issueMaintenanceCookie,
  matchesMaintenanceMaster,
} from "@/lib/maintenance-access";

const MAX_ACCESS_BODY_BYTES = 1_024;
const ACCESS_BODY_TIMEOUT_MS = 5_000;
const ACCESS_WINDOW_MS = 60_000;
const MAX_ACCESS_ATTEMPTS = 30;
let accessWindowStartedAt = 0;
let accessAttempts = 0;
let activeAccessRequests = 0;

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
  );
}

function admitAccessAttempt(): (() => void) | undefined {
  const now = Date.now();
  if (now - accessWindowStartedAt >= ACCESS_WINDOW_MS) {
    accessWindowStartedAt = now;
    accessAttempts = 0;
  }
  if (accessAttempts >= MAX_ACCESS_ATTEMPTS || activeAccessRequests >= 4) return undefined;
  accessAttempts += 1;
  activeAccessRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeAccessRequests = Math.max(0, activeAccessRequests - 1);
  };
}

async function readAccessToken(request: Request): Promise<string | undefined> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_ACCESS_BODY_BYTES))
    return undefined;
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
    "application/x-www-form-urlencoded"
  )
    return undefined;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel("maintenance access body timeout").catch(() => undefined);
  }, ACCESS_BODY_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ACCESS_BODY_BYTES) {
        void reader.cancel("maintenance access body limit exceeded").catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
    if (timedOut) return undefined;
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder().decode(body)).get("token") ?? undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.MAINTENANCE_MODE !== "true") return jsonError("Not found", 404);
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin) return jsonError("Maintenance access denied", 403);
  const release = admitAccessAttempt();
  if (!release) return jsonError("Maintenance access is temporarily rate limited", 429);
  try {
    const secret = process.env.MAINTENANCE_BYPASS_TOKEN;
    if (!isMaintenanceSecretConfigured(secret))
      return jsonError("Maintenance bypass is unavailable", 503);
    const candidate = await readAccessToken(request);
    if (!candidate || !(await matchesMaintenanceMaster(candidate, secret))) {
      return jsonError("Maintenance access denied", 403);
    }
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    response.cookies.set(MAINTENANCE_COOKIE, await issueMaintenanceCookie(secret), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAINTENANCE_COOKIE_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } finally {
    release();
  }
}
