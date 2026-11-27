"use client";
import * as React from "react";
import { ArrowUp, Paperclip, Plus, X } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { AttachmentStore } from "../use-attachment-store";
import { AttachmentPreviewStrip } from "./attachment-preview-strip";
import { ChatSuggestions } from "./chat-suggestions";

/** Leaf mark shown above the welcome prompt. */
function LeafLogoLarge(): React.JSX.Element {
  return (
    <span className="ph-leaf-lg" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path
          d="M20 7C20 7 10 11 10 21C10 27 14.5 32 20 32C25.5 32 30 27 30 21C30 15 25 9 20 7Z"
          fill="white"
          fillOpacity="0.95"
        />
        <line
          x1="20"
          y1="32"
          x2="20"
          y2="22"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * Empty-conversation state.
 *
 * The same surface shows the hero before the first question and the transcript
 * afterwards, so a new visitor lands on the product itself instead of a
 * separate landing route that only exists to hand off to the chat.
 */
export function ChatHero({
  value,
  onChange,
  onSend,
  onSuggest,
  busy,
  attachmentStore,
}: {
  value: string;
  onChange(value: string): void;
  onSend(): void;
  onSuggest(question: string): void;
  busy: boolean;
  attachmentStore: AttachmentStore;
}): React.JSX.Element {
  const t = useSurfaceTranslations("welcome");

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
    <main className="ph-welcome-main">
      <div className="ph-welcome-center">
        <div className="ph-welcome-logo-wrap">
          <LeafLogoLarge />
        </div>

        <h1 className="ph-welcome-title">{t("title")}</h1>
        <p className="ph-welcome-description">{t("description")}</p>

        <form
          className="ph-welcome-prompt-wrap"
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

          <div className="ph-welcome-prompt-inner">
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
                  event.target.value = "";
                }}
              />
            </div>

            <label htmlFor="welcome-input" className="sr-only">
              {t("inputLabel")}
            </label>
            <input
              id="welcome-input"
              type="text"
              autoComplete="off"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={busy}
              placeholder={t("inputPlaceholder")}
              className="ph-welcome-input"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("send")}
              className="ph-welcome-send"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
        </form>

        <ChatSuggestions onSelect={onSuggest} />
      </div>
    </main>
  );
}
