import { getSessionCookie } from "better-auth/cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  MAINTENANCE_COOKIE,
  isMaintenanceSecretConfigured,
  verifyMaintenanceCookie,
} from "@/lib/maintenance-access";
import { isMaintenanceExemptPath, isProtectedPath } from "@/lib/protected-paths";

export {
  AUTH_PATHS,
  MAINTENANCE_EXEMPT_PATHS,
  PROTECTED_PATHS,
  PUBLIC_BILLING_PATHS,
  isAuthPath,
  isMaintenanceExemptPath,
  isProtectedPath,
} from "@/lib/protected-paths";

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
    const response = NextResponse.redirect(new URL("/auth/sign-in", request.url));
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|static|.*\\..*).*)"],
};
