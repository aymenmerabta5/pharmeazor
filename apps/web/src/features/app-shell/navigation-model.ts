export type WorkspaceDestination =
  | "/dashboard"
  | "/agent"
  | "/storage"
  | "/billing"
  | "/pdf"
  | "/settings"
  | "/admin/users";

export const WORKSPACE_NAVIGATION = [
  { path: "/dashboard", label: "dashboard", match: "subtree" },
  { path: "/agent", label: "agent", match: "subtree" },
  { path: "/storage", label: "storage", match: "subtree" },
  { path: "/billing", label: "billing", match: "exact" },
  { path: "/pdf", label: "pdf", match: "subtree" },
  { path: "/settings", label: "settings", match: "subtree" },
  { path: "/admin/users", label: "admin", match: "subtree" },
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
