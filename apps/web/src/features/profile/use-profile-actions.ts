"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { signOutShell } from "@/features/app-shell/mutations";

export interface ProfileActions {
  readonly pending: boolean;
  signOut(): void;
}

/**
 * The account actions that belong to this screen.
 *
 * Signing out is a session transition, not a local view state: the shared auth
 * mutation clears the scoped query cache before the route leaves the profile.
 */
export function useProfileActions(): ProfileActions {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = useCallback(() => {
    if (pending) return;
    setPending(true);
    void signOutShell()
      .then(() => {
        router.push("/");
        router.refresh();
      })
      .finally(() => setPending(false));
  }, [pending, router]);

  return { pending, signOut };
}
