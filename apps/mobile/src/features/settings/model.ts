import type { QueryAuthScope } from "@/lib/query-client";
export interface SettingsUser {
  id: string;
  email: string;
  name: string | null;
  role?: string | null;
}
export interface IdentitySessionInitialData {
  id: string;
  userId: string;
  createdAt: string;
  authenticatedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  activeOrganizationId?: string | null;
  activeTeamId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}
export interface IdentitySessionsInitialState {
  initialSessions?: IdentitySessionInitialData[];
  initialScope?: QueryAuthScope;
}
export interface PasskeySummary {
  readonly id: string;
  readonly name?: string;
  readonly createdAt: Date | string;
  readonly deviceType: string;
  readonly backedUp: boolean;
}
export type TwoFactorInput = (
  | { kind: "enable" | "disable"; password: string }
  | { kind: "verify"; code: string }
) & { previousEnabled?: boolean };
export type PasskeyInput =
  | { kind: "register"; name?: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "delete"; id: string };
export function identityFailure(error: unknown): Error {
  return new Error("Identity operation failed", { cause: error });
}
export function identityErrorCode(error: unknown): string | undefined {
  const value = error instanceof Error ? error.cause : error;
  return value && typeof value === "object" && "code" in value && typeof value.code === "string"
    ? value.code
    : undefined;
}
