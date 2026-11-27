/**
 * Remote mutations for the chat surface.
 *
 * The oRPC client is only imported here so the feature hooks stay free of
 * transport details. Uploads resolve to the stored object descriptor that the
 * message payload then carries.
 */
import { orpcClient } from "@/lib/orpc";

/** Upload one staged attachment and return its stored object descriptor. */
export function uploadAttachment(file: File) {
  return orpcClient.storage.upload({ file });
}
