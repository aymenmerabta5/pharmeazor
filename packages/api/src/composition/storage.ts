import "server-only";
import { createOwnedStorageService } from "@repo/services/storage";
import { postgresOwnedStorageAdapter } from "../adapters/storage/postgres";
import type { ApiContext } from "../context";

export function createOwnedStorageServiceForRequest(_context: ApiContext) {
  return createOwnedStorageService(postgresOwnedStorageAdapter);
}
