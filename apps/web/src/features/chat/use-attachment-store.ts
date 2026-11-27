"use client";
/**
 * Attachment store for the chat composer.
 *
 * Manages the list of pending attachments the user has staged before sending.
 * Each item is uploaded immediately via the existing storage API so the object
 * ID is ready when the message is sent.  Local `blob:` URLs are kept for
 * thumbnail rendering and revoked when the item is removed or the hook unmounts.
 *
 * Responsibility boundary: pure client state + upload side-effect.
 * No remote state is duplicated here; the final message carries only the
 * resolved `AttachmentRef[]` values returned from the upload procedure.
 */

import * as React from "react";
import { orpcClient } from "@/lib/orpc";
import type { AttachmentRef } from "./model";

export type UploadStatus = "uploading" | "ready" | "error";

export interface PendingAttachment {
  /** Stable local key used as React key and for removal. */
  localId: string;
  file: File;
  status: UploadStatus;
  /** Set once the upload succeeds. */
  ref?: AttachmentRef;
  /** Error message when status === "error". */
  error?: string;
  /** Local blob: URL for image thumbnails. Revoked on removal. */
  previewUrl?: string;
}

export interface AttachmentStore {
  /** All items currently staged in the composer. */
  attachments: PendingAttachment[];
  /** Whether any item is still uploading. */
  uploading: boolean;
  /** Add files from a native file input change event (or a drop). */
  addFiles(files: FileList | File[]): void;
  /** Remove a single attachment by its localId. */
  remove(localId: string): void;
  /**
   * Collect all successfully uploaded refs and clear the list.
   * Call this just before the message is dispatched.
   */
  consumeRefs(): AttachmentRef[];
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

/** Returns a human-readable validation error or null. */
function validateFile(file: File): string | null {
  if (file.size <= 0) return "Empty file";
  if (file.size > MAX_FILE_BYTES) return "File too large (max 10 MB)";
  if (!ALLOWED_MIME.has(file.type.toLowerCase()))
    return `Unsupported type: ${file.type || "unknown"}`;
  return null;
}

let localIdCounter = 0;
function nextLocalId() {
  localIdCounter += 1;
  return `attach-${Date.now()}-${localIdCounter}`;
}

export function useAttachmentStore(): AttachmentStore {
  const [attachments, setAttachments] = React.useState<PendingAttachment[]>([]);

  /* Revoke all blob URLs on unmount. */
  React.useEffect(() => {
    return () => {
      setAttachments((prev) => {
        for (const item of prev) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        }
        return [];
      });
    };
  }, []);

  const addFiles = React.useCallback((files: FileList | File[]) => {
    const list = Array.from(files);
    const newItems: PendingAttachment[] = list.map((file) => {
      const error = validateFile(file);
      const localId = nextLocalId();
      const previewUrl = !error && isImage(file.type) ? URL.createObjectURL(file) : undefined;
      return {
        localId,
        file,
        status: error ? "error" : "uploading",
        error: error ?? undefined,
        previewUrl,
      };
    });

    setAttachments((prev) => [...prev, ...newItems]);

    /* Upload each valid file immediately. */
    for (const item of newItems) {
      if (item.status !== "uploading") continue;
      void (async () => {
        try {
          const result = await orpcClient.storage.upload({ file: item.file });
          setAttachments((prev) =>
            prev.map((a) =>
              a.localId === item.localId
                ? {
                    ...a,
                    status: "ready",
                    ref: {
                      objectId: result.id,
                      originalName: result.originalName,
                      mimeType: result.mimeType,
                      byteSize: result.byteSize,
                      previewUrl: a.previewUrl,
                    },
                  }
                : a,
            ),
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Upload failed";
          setAttachments((prev) =>
            prev.map((a) =>
              a.localId === item.localId ? { ...a, status: "error", error: message } : a,
            ),
          );
        }
      })();
    }
  }, []);

  const remove = React.useCallback((localId: string) => {
    setAttachments((prev) => {
      const item = prev.find((a) => a.localId === localId);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.localId !== localId);
    });
  }, []);

  const consumeRefs = React.useCallback((): AttachmentRef[] => {
    let refs: AttachmentRef[] = [];
    setAttachments((prev) => {
      refs = prev.filter((a) => a.status === "ready" && a.ref).map((a) => a.ref!);
      /* Revoke preview URLs of consumed items. */
      for (const a of prev) {
        if (a.status === "ready" && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      return [];
    });
    return refs;
  }, []);

  const uploading = attachments.some((a) => a.status === "uploading");

  return { attachments, uploading, addFiles, remove, consumeRefs };
}
