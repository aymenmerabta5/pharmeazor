import { after, connection, NextResponse } from "next/server";
export async function GET(): Promise<NextResponse> {
  // Health timestamps are request-scoped and must never be frozen at build time.
  await connection();
  const response = NextResponse.json({ status: "ok", time: new Date().toISOString() });
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Non-blocking post-response work — vercel server-after-nonblocking
  after(() => {
    // e.g. analytics, audit log — runs after response is sent
  });
  return response;
}
