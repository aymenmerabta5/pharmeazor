import { NextRequest, NextResponse } from "next/server";
import { env } from "@repo/config/server";

function getPostHogHost(): string {
  return env.POSTHOG_HOST ?? "";
}

const MAX_REQUEST_BODY_SIZE = 1_000_000;
const MAX_RESPONSE_BODY_SIZE = 5_000_000;
const BODY_READ_TIMEOUT_MS = 10_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_PROXY_REQUESTS = 8;
let activeProxyRequests = 0;

class ProxyBodyLimitError extends Error {
  constructor(readonly source: "request" | "response") {
    super(source + " body exceeded its configured limit");
  }
}

class ProxyBodyTimeoutError extends Error {
  constructor(readonly source: "request" | "response") {
    super(source + " body exceeded its read deadline");
  }
}

function declaredBodyTooLarge(value: string | null, limit: number): boolean {
  if (value === null) return false;
  if (!/^\d+$/.test(value)) return true;
  const parsed = Number(value);
  return !Number.isSafeInteger(parsed) || parsed > limit;
}

function admitProxyRequest(): (() => void) | undefined {
  if (activeProxyRequests >= MAX_CONCURRENT_PROXY_REQUESTS) return undefined;
  activeProxyRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeProxyRequests = Math.max(0, activeProxyRequests - 1);
  };
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
  source: "request" | "response",
): Promise<ArrayBuffer> {
  if (!body) return new ArrayBuffer(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel("body read timeout").catch(() => undefined);
  }, BODY_READ_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        void reader.cancel("body limit exceeded").catch(() => undefined);
        throw new ProxyBodyLimitError(source);
      }
      chunks.push(value);
    }
    if (timedOut) throw new ProxyBodyTimeoutError(source);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined.buffer;
}

function safeUpstreamLogData(error: unknown): Record<string, string> {
  return {
    provider: "posthog",
    error: error instanceof Error ? error.name : "UnknownError",
  };
}

const ALLOWLIST = [
  "https://us.i.posthog.com",
  "https://eu.i.posthog.com",
  "https://app.posthog.com",
  "https://us-assets.i.posthog.com",
  "https://eu-assets.i.posthog.com",
] as const;

function isAllowlistedHost(host: string): boolean {
  try {
    const parsed = new URL(host);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
    return ALLOWLIST.some((allowed) => parsed.origin === allowed);
  } catch {
    return false;
  }
}

function resolveTargetHost(): string {
  const configured = getPostHogHost();
  if (!configured) return "https://us.i.posthog.com";
  if (configured.startsWith("/")) {
    return "https://us.i.posthog.com";
  }
  if (isAllowlistedHost(configured)) {
    return new URL(configured).origin;
  }
  console.warn(
    "[analytics:proxy] POSTHOG_HOST is not allowlisted; using the default PostHog ingest host",
  );
  return "https://us.i.posthog.com";
}

function buildTargetUrl(request: NextRequest, host: string, extraPath?: string): string {
  const url = new URL(request.url);
  const search = url.search;
  let path = "/";
  const pathname = url.pathname;
  if (extraPath) {
    path = "/" + extraPath;
  } else {
    const idx = pathname.indexOf("/api/ingest");
    if (idx !== -1) {
      const after = pathname.slice(idx + "/api/ingest".length);
      path = after || "/";
    }
  }
  return host + path + search;
}

async function proxyRequest(request: NextRequest, extraPath?: string): Promise<NextResponse> {
  const targetHost = resolveTargetHost();
  const targetUrl = buildTargetUrl(request, targetHost, extraPath);

  if (!isAllowlistedHost(new URL(targetUrl).origin)) {
    return NextResponse.json({ error: "Invalid target host" }, { status: 400 });
  }

  const release = admitProxyRequest();
  if (!release) {
    return NextResponse.json(
      { error: "Analytics proxy is busy" },
      { status: 503, headers: { "Retry-After": "1" } },
    );
  }
  try {
    const contentEncoding = request.headers.get("content-encoding")?.trim().toLowerCase();
    if (contentEncoding && contentEncoding !== "identity") {
      return NextResponse.json(
        { error: "Compressed request bodies are not supported" },
        { status: 415 },
      );
    }
    if (declaredBodyTooLarge(request.headers.get("content-length"), MAX_REQUEST_BODY_SIZE)) {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    let rawBody: ArrayBuffer | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      rawBody = await readBoundedBody(request.body, MAX_REQUEST_BODY_SIZE, "request");
    }

    const headers: Record<string, string> = {};
    const forwardHeaders = [
      "content-type",
      "accept",
      "user-agent",
      "x-posthog-lib",
      "x-posthog-lib-version",
    ];
    for (const h of forwardHeaders) {
      const v = request.headers.get(h);
      if (v) headers[h] = v;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstream: Response;
    let resBody: ArrayBuffer;
    try {
      upstream = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: rawBody,
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
      if (declaredBodyTooLarge(upstream.headers.get("content-length"), MAX_RESPONSE_BODY_SIZE)) {
        void upstream.body?.cancel("response body limit exceeded").catch(() => undefined);
        throw new ProxyBodyLimitError("response");
      }
      resBody = await readBoundedBody(upstream.body, MAX_RESPONSE_BODY_SIZE, "response");
    } finally {
      clearTimeout(timeout);
    }
    const res = new NextResponse(resBody, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    const safeResponseHeaders = [
      "content-type",
      "cache-control",
      "access-control-allow-methods",
      "access-control-allow-headers",
    ];
    for (const h of safeResponseHeaders) {
      const v = upstream.headers.get(h);
      if (v) res.headers.set(h, v);
    }

    res.headers.set("access-control-allow-origin", "*");
    return res;
  } catch (error) {
    if (error instanceof ProxyBodyLimitError && error.source === "request") {
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    }
    if (error instanceof ProxyBodyTimeoutError && error.source === "request") {
      return NextResponse.json({ error: "Request body timeout" }, { status: 408 });
    }
    console.error("[analytics:proxy] Upstream fetch failed", safeUpstreamLogData(error));
    const status =
      error instanceof ProxyBodyTimeoutError ||
      (error instanceof Error && error.name === "AbortError")
        ? 504
        : 502;
    return NextResponse.json({ error: "Upstream error" }, { status });
  } finally {
    release();
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyRequest(request);
}

export async function OPTIONS(_request: NextRequest): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set("access-control-allow-origin", "*");
  res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  res.headers.set("access-control-allow-headers", "Content-Type");
  res.headers.set("access-control-max-age", "86400");
  return res;
}
