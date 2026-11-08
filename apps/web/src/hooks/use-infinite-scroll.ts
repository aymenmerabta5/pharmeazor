import { useCallback, useRef } from "react";

export function useInfiniteScroll(onIntersect: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) observerRef.current.disconnect();
      if (!node || !enabled) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) onIntersect();
        },
        { threshold: 0.1 },
      );
      observerRef.current.observe(node);
      ref.current = node;
    },
    [onIntersect, enabled],
  );

  return setRef;
}
