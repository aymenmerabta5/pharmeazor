"use client";
import type * as React from "react";
import { ArrowUp } from "lucide-react";

/** Composer for the chat surface. */
export function ChatInputBar({
  value,
  onChange,
  onSend,
  busy,
  placeholder,
  sendLabel,
}: {
  value: string;
  onChange(value: string): void;
  onSend(): void;
  busy: boolean;
  placeholder: string;
  sendLabel: string;
}): React.JSX.Element {
  return (
    <form
      className="ph-chat-input-wrap"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="ph-chat-input-inner">
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
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="ph-chat-send"
          aria-label={sendLabel}
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
