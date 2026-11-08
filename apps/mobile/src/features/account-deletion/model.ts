interface Owner {
  userId: string;
  sessionId: string;
}
interface Snapshot {
  identity: Owner | null;
  scope: (Owner & { tenantId: string | null; teamId: string | null }) | null;
}
const identityKey = (value: Owner | null) =>
  value ? JSON.stringify([value.userId, value.sessionId]) : null;

/** Retirement may observe its own anonymous state, but never a replacement identity. */
export function createAccountDeletionOwner(
  read: () => Snapshot,
  isMounted: () => boolean,
): () => boolean {
  const initial = read();
  const owner = identityKey(initial.identity);
  const scopeKey = JSON.stringify(initial.scope);
  let replaced = owner === null;
  let retired = false;
  return () => {
    const current = read();
    const identity = identityKey(current.identity);
    if (identity === null) retired = true;
    if (
      (identity !== null && (identity !== owner || retired)) ||
      (current.scope !== null && JSON.stringify(current.scope) !== scopeKey)
    )
      replaced = true;
    return !replaced && isMounted();
  };
}

export function identityFailure(error: unknown): Error {
  return new Error("Identity operation failed", { cause: error });
}
export function identityErrorCode(error: unknown): string | undefined {
  const value = error instanceof Error ? error.cause : error;
  return value && typeof value === "object" && "code" in value && typeof value.code === "string"
    ? value.code
    : undefined;
}
