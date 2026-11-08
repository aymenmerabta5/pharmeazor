export interface NavbarUser {
  email?: string;
  role?: string;
}

export function readNavbarUser(session: unknown): NavbarUser | undefined {
  if (typeof session !== "object" || session === null || !("user" in session)) return undefined;
  const candidate = session.user;
  if (typeof candidate !== "object" || candidate === null) return undefined;
  return {
    email:
      "email" in candidate && typeof candidate.email === "string" ? candidate.email : undefined,
    role: "role" in candidate && typeof candidate.role === "string" ? candidate.role : undefined,
  };
}
