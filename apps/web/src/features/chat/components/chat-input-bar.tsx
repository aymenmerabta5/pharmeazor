"use client";
import type * as React from "react";
import { ArrowUp } from "lucide-react";
import type { AttachmentStore } from "../use-attachment-store";
import { AttachmentPreviewStrip } from "./attachment-preview-strip";
import { ChatAttachButton } from "./chat-attach-button";

/** Composer for the chat surface. */
export function ChatInputBar({
  value,
  onChange,
  onSend,
  busy,
  placeholder,
  sendLabel,
  attachmentStore,
  canAttach,
  onRequireAuth,
}: {
  value: string;
  onChange(value: string): void;
  onSend(): void;
  busy: boolean;
  placeholder: string;
  sendLabel: string;
  attachmentStore: AttachmentStore;
  canAttach: boolean;
  onRequireAuth(): void;
}): React.JSX.Element {
  const hasContent = value.trim().length > 0 || attachmentStore.attachments.length > 0;
  const canSend = hasContent && !busy && !attachmentStore.uploading;

  return (
    <form
      className="ph-chat-input-wrap"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      {/* Attachment preview strip — above the input bar */}
      {attachmentStore.attachments.length > 0 && (
        <AttachmentPreviewStrip
          attachments={attachmentStore.attachments}
          onRemove={attachmentStore.remove}
        />
      )}

      <div className="ph-chat-input-inner">
        <ChatAttachButton
          attachmentStore={attachmentStore}
          canAttach={canAttach}
          onRequireAuth={onRequireAuth}
        />

        <label htmlFor="chat-input" className="sr-only">
          {placeholder}
        </label>
        <input
          id="chat-input"
          type="text"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={busy}
          placeholder={placeholder}
          className="ph-chat-input"
        />
        <button type="submit" disabled={!canSend} className="ph-chat-send" aria-label={sendLabel}>
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
