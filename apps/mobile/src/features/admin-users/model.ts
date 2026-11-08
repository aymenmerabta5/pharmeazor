export type AdminRole = "admin" | "user";
export interface AdminCreateValues {
  name: string;
  email: string;
  password: string;
  role: AdminRole;
}
export interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  banned?: boolean | null;
}
export function canCreateAdminUser(value: AdminCreateValues): boolean {
  return Boolean(value.name.trim()) && value.email.includes("@") && value.password.length >= 8;
}
