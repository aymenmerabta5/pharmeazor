import type { HeaderUser } from "./header-user-menu";

export type WorkspaceIdentity =
  | { status: "pending" }
  | { status: "authenticated"; user: HeaderUser }
  | { status: "anonymous" }
  | { status: "error"; retry(): void };

export function resolveWorkspaceIdentity(input: {
  pending: boolean;
  error: unknown;
  user: HeaderUser | null;
  retry(): void;
}): WorkspaceIdentity {
  if (input.pending) return { status: "pending" };
  if (input.error) return { status: "error", retry: input.retry };
  if (input.user) return { status: "authenticated", user: input.user };
  return { status: "anonymous" };
}
