"use client";
import * as React from "react";
import { ArrowUp, Paperclip, Plus, X } from "lucide-react";
import type { AttachmentStore } from "../use-attachment-store";
import { AttachmentPreviewStrip } from "./attachment-preview-strip";

/** Composer for the chat surface. */
export function ChatInputBar({
  value,
  onChange,
  onSend,
  busy,
  placeholder,
  sendLabel,
  attachmentStore,
}: {
  value: string;
  onChange(value: string): void;
  onSend(): void;
  busy: boolean;
  placeholder: string;
  sendLabel: string;
  attachmentStore: AttachmentStore;
}): React.JSX.Element {
  const [popupOpen, setPopupOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const addBtnRef = React.useRef<HTMLButtonElement>(null);

  /* Close popup when clicking outside */
  React.useEffect(() => {
    if (!popupOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        addBtnRef.current &&
        !addBtnRef.current.contains(e.target as Node)
      ) {
        setPopupOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popupOpen]);

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
        {/* + / × attachment button */}
        <div className="ph-attach-wrap">
          {popupOpen && (
            <div className="ph-attach-popup" ref={popupRef} role="menu">
              <button
                type="button"
                className="ph-attach-option"
                role="menuitem"
                onClick={() => {
                  setPopupOpen(false);
                  fileInputRef.current?.click();
                }}
              >
                <span className="ph-attach-icon">
                  <Paperclip className="size-4" aria-hidden />
                </span>
                <span className="ph-attach-label">
                  <span className="ph-attach-title">Add photos and files</span>
                  <span className="ph-attach-sub">From your computer</span>
                </span>
              </button>
            </div>
          )}

          <button
            ref={addBtnRef}
            type="button"
            className={`ph-attach-btn${popupOpen ? " ph-attach-btn--open" : ""}`}
            aria-label={popupOpen ? "Close attachment menu" : "Add attachment"}
            aria-expanded={popupOpen}
            onClick={() => setPopupOpen((v) => !v)}
          >
            {popupOpen ? (
              <X className="size-4" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
          </button>

          {/* Hidden native file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.txt,.csv,.md"
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) {
                attachmentStore.addFiles(files);
              }
              // Reset so the same file can be re-selected
              event.target.value = "";
            }}
          />
        </div>

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
