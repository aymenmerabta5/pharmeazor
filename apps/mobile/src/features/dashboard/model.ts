export function authUserRole(value: unknown): string {
  if (typeof value !== "object" || value === null) return "user";
  const role = Reflect.get(value, "role");
  return typeof role === "string" ? role : "user";
}
