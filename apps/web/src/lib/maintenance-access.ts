export const MAINTENANCE_COOKIE = "ghostinit_maintenance_bypass";
export const MAINTENANCE_COOKIE_TTL_SECONDS = 15 * 60;
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): ArrayBuffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid maintenance cookie");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  // atob accepts alternate trailing pad bits that decode to the same MAC.
  // Require the one canonical unpadded base64url spelling before verification.
  if (base64Url(bytes) !== value) throw new Error("Invalid maintenance cookie");
  return bytes.buffer;
}

async function maintenanceKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function isMaintenanceSecretConfigured(secret: string | undefined): secret is string {
  return Boolean(
    secret &&
    secret.length >= 32 &&
    secret.length <= 512 &&
    !secret.startsWith("REPLACE_WITH") &&
    new Set(secret).size >= 12,
  );
}

export async function matchesMaintenanceMaster(
  candidate: string,
  secret: string,
): Promise<boolean> {
  if (candidate.length === 0 || candidate.length > 512 || !isMaintenanceSecretConfigured(secret))
    return false;
  const [candidateHash, secretHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(secretHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

export async function issueMaintenanceCookie(secret: string): Promise<string> {
  if (!isMaintenanceSecretConfigured(secret))
    throw new Error("Maintenance bypass is not securely configured");
  const expiresAt = Date.now() + MAINTENANCE_COOKIE_TTL_SECONDS * 1000;
  const payload = "ghostinit-maintenance:" + String(expiresAt);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await maintenanceKey(secret),
    encoder.encode(payload),
  );
  return String(expiresAt) + "." + base64Url(new Uint8Array(signature));
}

export async function verifyMaintenanceCookie(
  value: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!value || value.length > 256 || !isMaintenanceSecretConfigured(secret)) return false;
  const [expiresText, encodedSignature, ...extra] = value.split(".");
  if (extra.length > 0 || !expiresText || !encodedSignature || !/^\d{13}$/.test(expiresText))
    return false;
  const expiresAt = Number(expiresText);
  const now = Date.now();
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + MAINTENANCE_COOKIE_TTL_SECONDS * 1000
  )
    return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await maintenanceKey(secret),
      decodeBase64Url(encodedSignature),
      encoder.encode("ghostinit-maintenance:" + expiresText),
    );
  } catch {
    return false;
  }
}
