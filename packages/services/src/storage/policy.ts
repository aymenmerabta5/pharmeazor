/**
 * Application-owned starter storage policy. Change these values deliberately
 * with a data-migration plan; they are not provider or environment defaults.
 */
export const DEFAULT_STORAGE_QUOTA = Object.freeze({
  maxObjectBytes: 10485760,
  maxObjectsPerOwner: 100,
  maxBytesPerOwner: 104857600,
  pendingReservationTtlMs: 900000,
});

export type StorageQuotaPolicy = typeof DEFAULT_STORAGE_QUOTA;

export type StorageQuotaDecision = "allow" | "invalid" | "quota-exceeded";

const MANAGED_STORAGE_PARAMETER_PREFIX = "ghostinit-upload=";
const MANAGED_STORAGE_TOKEN = /^[0-9a-f]{32}$/;

/** Marks blobs exclusively owned by the generated central Convex registry. */
export function managedStorageContentType(mimeType: string, token: string): string {
  if (!MANAGED_STORAGE_TOKEN.test(token)) {
    throw new TypeError("Managed storage token must be 128-bit lowercase hex");
  }
  return `${mimeType.trim().toLowerCase()}; ${MANAGED_STORAGE_PARAMETER_PREFIX}${token}`;
}

export function managedStorageToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const parameter = value
    .split(";")
    .slice(1)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.toLowerCase().startsWith(MANAGED_STORAGE_PARAMETER_PREFIX));
  if (!parameter) return null;
  const token = parameter.slice(MANAGED_STORAGE_PARAMETER_PREFIX.length);
  return MANAGED_STORAGE_TOKEN.test(token) ? token : null;
}

export function isManagedStorageContentType(value: string | null | undefined): boolean {
  return managedStorageToken(value) !== null;
}

export function managedStorageBaseMimeType(
  value: string | null | undefined,
  expectedToken?: string,
): string | null {
  const token = managedStorageToken(value);
  if (!token || (expectedToken !== undefined && token !== expectedToken)) return null;
  const base = value?.split(";", 1)[0]?.trim().toLowerCase();
  return base || null;
}

/** Pure application policy; persistence adapters provide one atomic usage snapshot. */
export function decideStorageQuota(
  currentByteSizes: readonly number[],
  expectedByteSize: number,
): StorageQuotaDecision {
  if (
    !Number.isSafeInteger(expectedByteSize) ||
    expectedByteSize < 1 ||
    expectedByteSize > DEFAULT_STORAGE_QUOTA.maxObjectBytes
  ) {
    return "invalid";
  }
  let usedBytes = 0;
  for (const byteSize of currentByteSizes) {
    if (!Number.isSafeInteger(byteSize) || byteSize < 1) return "invalid";
    usedBytes += byteSize;
    if (!Number.isSafeInteger(usedBytes)) return "invalid";
  }
  if (
    currentByteSizes.length >= DEFAULT_STORAGE_QUOTA.maxObjectsPerOwner ||
    usedBytes > DEFAULT_STORAGE_QUOTA.maxBytesPerOwner - expectedByteSize
  ) {
    return "quota-exceeded";
  }
  return "allow";
}
