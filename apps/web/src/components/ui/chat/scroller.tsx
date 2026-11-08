"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../button";
import { cn } from "@/lib/utils";
import { useSurfaceTranslations } from "@/lib/translations";

const MessageScrollerContext = React.createContext<React.RefObject<HTMLDivElement | null> | null>(
  null,
);

export function MessageScrollerProvider({
  autoScroll = false,
  children,
}: {
  autoScroll?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (autoScroll) viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
  }, [autoScroll, children]);
  return (
    <MessageScrollerContext.Provider value={viewportRef}>
      {children}
    </MessageScrollerContext.Provider>
  );
}

export const MessageScroller = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="message-scroller"
    className={cn("relative flex min-h-0 flex-1 flex-col", className)}
    {...props}
  />
));
MessageScroller.displayName = "MessageScroller";

export const MessageScrollerViewport = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, forwardedRef) => {
  const viewportRef = React.useContext(MessageScrollerContext);
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (viewportRef) viewportRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef, viewportRef],
  );
  return (
    <div
      ref={ref}
      data-slot="message-scroller-viewport"
      className={cn("scroll-fade min-h-0 flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
});
MessageScrollerViewport.displayName = "MessageScrollerViewport";

export const MessageScrollerContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="message-scroller-content"
    className={cn("flex flex-col gap-3 p-3", className)}
    {...props}
  />
));
MessageScrollerContent.displayName = "MessageScrollerContent";

export interface MessageScrollerItemProps extends React.HTMLAttributes<HTMLDivElement> {
  messageId: string;
  scrollAnchor?: boolean;
}
export const MessageScrollerItem = React.forwardRef<HTMLDivElement, MessageScrollerItemProps>(
  ({ className, messageId, scrollAnchor, ...props }, ref) => (
    <div
      ref={ref}
      data-message-id={messageId}
      data-scroll-anchor={scrollAnchor || undefined}
      className={className}
      {...props}
    />
  ),
);
MessageScrollerItem.displayName = "MessageScrollerItem";

export function MessageScrollerButton(): React.JSX.Element {
  const viewportRef = React.useContext(MessageScrollerContext);
  const t = useSurfaceTranslations("messaging");
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={t("jumpToLatest")}
      className="absolute bottom-3 end-3"
      onClick={() =>
        viewportRef?.current?.scrollTo({
          top: viewportRef.current.scrollHeight,
          behavior: "smooth",
        })
      }
    >
      <ChevronDown aria-hidden />
    </Button>
  );
}
