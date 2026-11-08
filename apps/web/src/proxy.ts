import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MAINTENANCE_COOKIE,
  isMaintenanceSecretConfigured,
  verifyMaintenanceCookie,
} from "@/lib/maintenance-access";

export const MAINTENANCE_EXEMPT_PATHS = [
  "/login",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/forgot-password",
  "/verify",
  "/maintenance",
] as const;

function matchesPath(path: string, base: string): boolean {
  if (path === base) return true;
  if (!path.startsWith(base)) return false;
  const nextChar = path.charAt(base.length);
  return nextChar === "/" || nextChar === "?" || nextChar === "#";
}

export const PROTECTED_PATHS = [
  "/agent",
  "/dashboard",
  "/onboarding",
  "/profile",
  "/admin",
  "/settings",
  "/billing",
] as const;
export const AUTH_PATHS = [
  "/login",
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/forgot-password",
] as const;
export const PUBLIC_BILLING_PATHS: readonly string[] = ["/billing/success", "/billing/cancel"];

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_BILLING_PATHS.some((path) => pathname === path || pathname === path + "/"))
    return false;
  return PROTECTED_PATHS.some((path) => matchesPath(pathname, path));
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => matchesPath(pathname, path));
}

export function isMaintenanceExemptPath(pathname: string): boolean {
  return MAINTENANCE_EXEMPT_PATHS.some((path) => matchesPath(pathname, path));
}

interface MaintenanceStatus {
  enabled: boolean;
  canBypass: boolean;
}

async function checkMaintenanceStatus(request: NextRequest): Promise<MaintenanceStatus> {
  if (process.env.MAINTENANCE_MODE !== "true") return { enabled: false, canBypass: true };
  const secret = process.env.MAINTENANCE_BYPASS_TOKEN;
  if (!isMaintenanceSecretConfigured(secret)) return { enabled: true, canBypass: false };
  return {
    enabled: true,
    canBypass: await verifyMaintenanceCookie(
      request.cookies.get(MAINTENANCE_COOKIE)?.value,
      secret,
    ),
  };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const maintenance = await checkMaintenanceStatus(request);

  if (!isMaintenanceExemptPath(pathname)) {
    if (maintenance.enabled && !maintenance.canBypass) {
      const response = NextResponse.rewrite(new URL("/maintenance", request.url));
      response.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      response.headers.set("CDN-Cache-Control", "no-store");
      return response;
    }
  }

  if (isProtectedPath(pathname) && !getSessionCookie(request)) {
    const response = NextResponse.redirect(new URL("/sign-in", request.url));
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|static|.*\\..*).*)"],
};
