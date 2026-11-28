export type WorkspaceDestination =
  | "/dashboard"
  | "/agent"
  | "/settings/billing"
  | "/profile"
  | "/settings"
  | "/admin/users";

export const WORKSPACE_NAVIGATION = [
  { path: "/dashboard", label: "dashboard", match: "subtree" },
  { path: "/agent", label: "agent", match: "subtree" },
  { path: "/settings/billing", label: "billing", match: "exact" },
  { path: "/profile", label: "profile", match: "subtree" },
  { path: "/settings", label: "settings", match: "subtree" },
  { path: "/admin/users", label: "admin", match: "subtree" },
] as const;

/**
 * Legacy billing entry points, redirected to their replacement routes.
 *
 * Customer billing moved under settings, and the provider return pages moved
 * under checkout. Each legacy URL stays an exact match so an old return link
 * can never resolve as a workspace subtree.
 */
export const LEGACY_BILLING_REDIRECTS = [
  { path: "/billing", destination: "/settings/billing", match: "exact" },
  { path: "/billing/success", destination: "/checkout/success", match: "exact" },
  { path: "/billing/cancel", destination: "/checkout/cancel", match: "exact" },
] as const;

export function isCurrentPath(
  pathname: string,
  destination: string,
  match: "exact" | "subtree",
): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const root = destination.startsWith("/admin") ? "/admin" : destination;
  return normalized === root || (match === "subtree" && normalized.startsWith(root + "/"));
}

// Register custom protected routes above; unknown routes retain the public layout.
export function workspaceSection(
  pathname: string,
): (typeof WORKSPACE_NAVIGATION)[number]["label"] | undefined {
  return WORKSPACE_NAVIGATION.find((entry) => isCurrentPath(pathname, entry.path, entry.match))
    ?.label;
}
