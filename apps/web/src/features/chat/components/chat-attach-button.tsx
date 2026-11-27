"use client";
import * as React from "react";
import { Paperclip, Plus, X } from "lucide-react";
import type { AttachmentStore } from "../use-attachment-store";

/**
 * Attachment menu for the welcome prompt.
 *
 * Owns the popup state, the outside-click dismissal and the hidden native file
 * input; the parent only sees the selected files through the attachment store.
 */
export function ChatAttachButton({
  attachmentStore,
}: {
  attachmentStore: AttachmentStore;
}): React.JSX.Element {
  const [popupOpen, setPopupOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const addBtnRef = React.useRef<HTMLButtonElement>(null);

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

  return (
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
        {popupOpen ? <X className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      </button>

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
          event.target.value = "";
        }}
      />
    </div>
  );
}
