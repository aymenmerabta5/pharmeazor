import "server-only";
import type { StorageActor } from "./contracts";
import { StorageServiceError } from "./errors";
import type { OwnedStoragePort } from "./owned-ports";
import { DEFAULT_STORAGE_QUOTA } from "./policy";

const ALLOWED_STORAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

function requireStorageActor(actor: StorageActor): void {
  if (!actor.id)
    throw new StorageServiceError("STORAGE_UNAUTHENTICATED", "Authentication required");
  if (actor.banned)
    throw new StorageServiceError("STORAGE_ACTOR_BANNED", "Suspended accounts cannot use storage");
}

function safeStorageName(value: string): string {
  let leafStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x2f || code === 0x5c) leafStart = index + 1;
  }
  const leaf = Array.from(value.slice(leafStart), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? "_" : character;
  })
    .join("")
    .trim();
  return Array.from(leaf || "object")
    .slice(0, 255)
    .join("");
}

function storageFailureCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = Reflect.get(error, "code");
  if (typeof direct === "string") return direct;
  const data = Reflect.get(error, "data");
  if (!data || typeof data !== "object") return undefined;
  const nested = Reflect.get(data, "code");
  return typeof nested === "string" ? nested : undefined;
}

export function createOwnedStorageService(port: OwnedStoragePort) {
  return {
    async upload(
      actor: StorageActor,
      input: { data: Uint8Array; mimeType: string; originalName: string },
    ) {
      requireStorageActor(actor);
      const mimeType = input.mimeType.trim().toLowerCase();
      if (
        input.data.byteLength < 1 ||
        input.data.byteLength > DEFAULT_STORAGE_QUOTA.maxObjectBytes ||
        !ALLOWED_STORAGE_MIME_TYPES.has(mimeType)
      ) {
        throw new StorageServiceError("STORAGE_INVALID_FILE", "The uploaded file is not allowed");
      }
      try {
        return await port.putOwned({
          ownerId: actor.id,
          data: input.data,
          mimeType,
          originalName: safeStorageName(input.originalName),
        });
      } catch (cause) {
        if (cause instanceof StorageServiceError) throw cause;
        if (storageFailureCode(cause) === "STORAGE_QUOTA_EXCEEDED") {
          throw new StorageServiceError("STORAGE_QUOTA_EXCEEDED", "Storage quota exceeded", {
            cause,
          });
        }
        throw cause;
      }
    },
    async download(actor: StorageActor, id: string) {
      requireStorageActor(actor);
      const value = await port.getOwned({ ownerId: actor.id, id });
      if (!value)
        throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Stored object not found");
      return value;
    },
    async remove(actor: StorageActor, id: string) {
      requireStorageActor(actor);
      const deleted = await port.deleteOwned({ ownerId: actor.id, id });
      if (!deleted)
        throw new StorageServiceError("STORAGE_ATTACHMENT_NOT_FOUND", "Stored object not found");
      return { ok: true as const };
    },
  };
}

export type OwnedStorageService = ReturnType<typeof createOwnedStorageService>;
