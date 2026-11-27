import type * as React from "react";
import { FileText } from "lucide-react";
import type { AttachmentRef } from "../model";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BubbleAttachment({ att }: { att: AttachmentRef }): React.JSX.Element {
  const isImage = att.mimeType.startsWith("image/");

  if (isImage && att.previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={att.previewUrl}
        alt={att.originalName}
        className="ph-bubble-attachment-img"
      />
    );
  }

  return (
    <div className="ph-bubble-attachment-file">
      <FileText className="size-4" aria-hidden />
      <div className="ph-bubble-attachment-meta">
        <span className="ph-bubble-attachment-name">{att.originalName}</span>
        <span className="ph-bubble-attachment-size">{formatBytes(att.byteSize)}</span>
      </div>
    </div>
  );
}

/** One question sent by the user. */
export function UserBubble({
  content,
  attachments,
}: {
  content: string;
  attachments?: AttachmentRef[];
}): React.JSX.Element {
  return (
    <div className="ph-msg-user-row">
      <div className="ph-msg-user-bubble">
        {attachments && attachments.length > 0 && (
          <div className="ph-bubble-attachments">
            {attachments.map((att) => (
              <BubbleAttachment key={att.objectId} att={att} />
            ))}
          </div>
        )}
        {content && <span>{content}</span>}
      </div>
    </div>
  );
}
