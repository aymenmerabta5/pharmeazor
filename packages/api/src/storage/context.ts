import { StorageServiceError } from "@repo/services/storage";
import type { OwnedStorageService, StorageActor } from "@repo/services/storage";

export interface StorageTransportContext {
  storageActor?: StorageActor | null;
}

export type ResolveStorageService<TContext extends StorageTransportContext> = (
  context: TContext,
) => OwnedStorageService | Promise<OwnedStorageService>;

export function requireStorageActor(context: StorageTransportContext): StorageActor {
  if (!context.storageActor?.id) {
    throw new StorageServiceError("STORAGE_UNAUTHENTICATED", "Authentication is required");
  }
  if (context.storageActor.banned) {
    throw new StorageServiceError("STORAGE_ACTOR_BANNED", "Suspended accounts cannot use storage");
  }
  return context.storageActor;
}
