/**
 * Route access policy for the proxy.
 *
 * Pure path matching with no framework imports, so the policy can be read and
 * tested without a request. The proxy owns the environment and only applies
 * the result.
 */

/** The routes a customer needs when they come back from checkout. */
export const PROTECTED_PATHS = [
  "/agent",
  "/dashboard",
  "/onboarding",
  "/checkout",
  "/profile",
  "/admin",
  "/settings",
] as const;

/** Routes that render an authentication screen. */
export const AUTH_PATHS = ["/login", "/auth"] as const;

/** The public pages a payment rail returns the customer to. */
export const PUBLIC_BILLING_PATHS: readonly string[] = ["/checkout/success", "/checkout/cancel"];

/** Routes that stay reachable while maintenance mode is on. */
export const MAINTENANCE_EXEMPT_PATHS = ["/login", "/auth", "/verify", "/maintenance"] as const;

function matchesPath(path: string, base: string): boolean {
  if (path === base) return true;
  if (!path.startsWith(base)) return false;
  const nextChar = path.charAt(base.length);
  return nextChar === "/" || nextChar === "?" || nextChar === "#";
}

/** True when the path requires a session. */
export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_BILLING_PATHS.some((path) => pathname === path || pathname === path + "/"))
    return false;
  return PROTECTED_PATHS.some((path) => matchesPath(pathname, path));
}

/** True when the path renders an authentication screen. */
export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => matchesPath(pathname, path));
}

/** True when the path stays reachable while maintenance mode is on. */
export function isMaintenanceExemptPath(pathname: string): boolean {
  return MAINTENANCE_EXEMPT_PATHS.some((path) => matchesPath(pathname, path));
}
