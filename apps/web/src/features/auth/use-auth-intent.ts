"use client";
import * as React from "react";

/** Public authentication may intentionally change identity; this guards its form lifetime and active intent only. */
export function createAuthIntent() {
  let mounted = false;
  let epoch = 0;
  let busy = false;
  return {
    mount() {
      mounted = true;
      epoch += 1;
    },
    retire() {
      mounted = false;
      epoch += 1;
      busy = false;
    },
    begin() {
      if (!mounted || busy) return null;
      busy = true;
      const generation = epoch;
      const isCurrent = () => mounted && generation === epoch;
      return {
        isCurrent,
        finish: () => {
          if (isCurrent()) busy = false;
        },
      };
    },
  };
}
export function useAuthIntent() {
  const reference = React.useRef<ReturnType<typeof createAuthIntent> | null>(null);
  if (!reference.current) reference.current = createAuthIntent();
  const intent = reference.current;
  React.useEffect(() => {
    intent.mount();
    return () => intent.retire();
  }, [intent]);
  return intent;
}
export type AuthIntent = ReturnType<typeof createAuthIntent>;
