import { useState } from "react";
import { useRouter } from "expo-router";
import { signOutMobile } from "./mutations";
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function signOut(): Promise<void> {
    setPending(true);
    try {
      await signOutMobile();
    } finally {
      setPending(false);
      router.replace("/");
    }
  }
  return { pending, signOut };
}
