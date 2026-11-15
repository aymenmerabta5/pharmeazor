import type * as React from "react";

/** One question sent by the user. */
export function UserBubble({ content }: { content: string }): React.JSX.Element {
  return (
    <div className="ph-msg-user-row">
      <div className="ph-msg-user-bubble">{content}</div>
    </div>
  );
}
