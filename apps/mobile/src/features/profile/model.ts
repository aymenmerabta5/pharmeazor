export type ProfileRole = "member" | "admin" | "superAdmin";

export function profileRole(value: unknown): ProfileRole {
  if (typeof value !== "object" || value === null) return "member";
  const role = Reflect.get(value, "role");
  if (role === "admin") return "admin";
  if (role === "superAdmin") return "superAdmin";
  return "member";
}

export function profileInitials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "PH";
}
