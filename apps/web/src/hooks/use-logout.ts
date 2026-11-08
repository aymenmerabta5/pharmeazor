"use client";
import { useCallback, useState } from "react";

export function useLogout() {
  const [loading, setLoading] = useState(false);
  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      // Works for Next.js (next/navigation) and TanStack Start (window) — avoid framework-specific router import.
      window.location.href = "/sign-in";
    } finally {
      setLoading(false);
    }
  }, []);
  return { logout, loading };
}
