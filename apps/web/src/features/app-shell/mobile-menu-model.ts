import type { WorkspaceIdentity } from "@/components/workspace-identity";
import type { SurfaceTranslate } from "@/lib/translations";
import { isCurrentPath } from "./navigation-model";

export interface MobileMenuDestination {
  readonly href: string;
  readonly label: string;
  readonly current: boolean;
}

export interface MobileMenuDestinations {
  readonly primary: readonly MobileMenuDestination[];
  readonly workspace: readonly MobileMenuDestination[];
}

/**
 * The rows the mobile menu offers.
 *
 * Public visitors get the two entry points they can use, signed-in users get
 * the workspace destinations, and the administrator row only appears for an
 * administrator. Current-path marking is decided here so the view stays a
 * pure renderer.
 */
export function mobileMenuDestinations({
  identity,
  pathname,
  header,
  plans,
}: {
  identity: WorkspaceIdentity;
  pathname: string;
  header: SurfaceTranslate<"header">;
  plans: SurfaceTranslate<"pricing">;
}): MobileMenuDestinations {
  const link = (
    href: string,
    label: string,
    match: "exact" | "subtree",
  ): MobileMenuDestination => ({
    href,
    label,
    current: isCurrentPath(pathname, href, match),
  });

  const primary = [link("/", header("home"), "exact"), link("/pricing", plans("eyebrow"), "exact")];

  if (identity.status !== "authenticated") return { primary, workspace: [] };

  const workspace = [
    link("/dashboard", header("dashboard"), "subtree"),
    link("/agent", header("agent"), "subtree"),
    link("/settings/billing", header("billing"), "exact"),
    link("/profile", header("profile"), "subtree"),
    link("/settings", header("settings"), "subtree"),
    ...(identity.user.role === "admin" ? [link("/admin/users", header("admin"), "subtree")] : []),
  ];

  return { primary, workspace };
}
