"use client";
/**
 * AttachmentPreviewStrip
 *
 * Renders the staged attachments inside the composer as a horizontal strip of
 * chips/thumbnails.  Each chip shows:
 *   - an image thumbnail (images) or a file-type icon (non-images)
 *   - the filename (truncated)
 *   - an upload spinner while status === "uploading"
 *   - a red error indicator while status === "error"
 *   - an × remove button
 */

import * as React from "react";
import { X, FileText, Loader2, AlertCircle } from "lucide-react";
import type { PendingAttachment } from "../use-attachment-store";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChip({
  item,
  onRemove,
}: {
  item: PendingAttachment;
  onRemove(): void;
}): React.JSX.Element {
  const isImage = item.file.type.startsWith("image/");
  const isError = item.status === "error";
  const isUploading = item.status === "uploading";

  return (
    <div
      className={`ph-attachment-chip${isError ? " ph-attachment-chip--error" : ""}`}
      title={isError ? item.error : item.file.name}
    >
      {/* Thumbnail or icon */}
      <div className="ph-attachment-thumb">
        {isImage && item.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt={item.file.name} className="ph-attachment-img" />
        ) : (
          <FileText className="size-4 ph-attachment-file-icon" aria-hidden />
        )}
        {/* Overlay spinner / error badge */}
        {isUploading && (
          <div className="ph-attachment-overlay">
            <Loader2 className="size-3 ph-attachment-spinner" aria-hidden />
          </div>
        )}
        {isError && (
          <div className="ph-attachment-overlay ph-attachment-overlay--error">
            <AlertCircle className="size-3" aria-hidden />
          </div>
        )}
      </div>

      {/* Filename + size */}
      <div className="ph-attachment-info">
        <span className="ph-attachment-name">{item.file.name}</span>
        {!isError && <span className="ph-attachment-size">{formatBytes(item.file.size)}</span>}
        {isError && <span className="ph-attachment-error-label">{item.error}</span>}
      </div>

      {/* Remove button */}
      <button
        type="button"
        className="ph-attachment-remove"
        aria-label={`Remove ${item.file.name}`}
        onClick={onRemove}
      >
        <X className="size-3" aria-hidden />
      </button>
    </div>
  );
}

export function AttachmentPreviewStrip({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove(localId: string): void;
}): React.JSX.Element | null {
  if (attachments.length === 0) return null;

  return (
    <div className="ph-attachment-strip" role="list" aria-label="Staged attachments">
      {attachments.map((item) => (
        <div key={item.localId} role="listitem">
          <AttachmentChip item={item} onRemove={() => onRemove(item.localId)} />
        </div>
      ))}
    </div>
  );
}
