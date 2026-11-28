export type ProfileRole = "user" | "admin" | "superAdmin";

export interface ProfileUser {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
  readonly role: string | null;
  readonly emailVerified: boolean;
}

export const PROFILE_QUICK_LINKS = [
  { key: "dashboard", href: "/dashboard" },
  { key: "agent", href: "/agent" },
  { key: "billing", href: "/settings/billing" },
  { key: "storage", href: "/storage" },
  { key: "pdf", href: "/pdf" },
  { key: "settings", href: "/settings" },
  { key: "workspace", href: "/settings/workspace" },
] as const;

export const PROFILE_ADMIN_QUICK_LINK = { key: "admin", href: "/admin/users" } as const;

export type ProfileQuickLinkKey =
  | (typeof PROFILE_QUICK_LINKS)[number]["key"]
  | (typeof PROFILE_ADMIN_QUICK_LINK)["key"];

export interface ProfileQuickLink {
  readonly key: ProfileQuickLinkKey;
  readonly href: string;
}

/**
 * The destination rows the profile offers.
 *
 * The administrator row is only meaningful to an administrator, so the view
 * receives one list and never has to know about the role check.
 */
export function profileQuickLinks(role: unknown): readonly ProfileQuickLink[] {
  return role === "admin" || role === "superAdmin"
    ? [...PROFILE_QUICK_LINKS, PROFILE_ADMIN_QUICK_LINK]
    : PROFILE_QUICK_LINKS;
}

export function profileRole(value: unknown): ProfileRole {
  if (value === "admin") return "admin";
  if (value === "superAdmin") return "superAdmin";
  return "user";
}

export function profileInitials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && first && last) {
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
  }
  if (first) return first.slice(0, 2).toUpperCase();
  const address = email?.trim();
  if (address) return address.slice(0, 2).toUpperCase();
  return "PH";
}
