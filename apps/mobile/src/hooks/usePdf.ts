import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { authClient } from "@/lib/auth-client";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { env } from "@repo/config/expo";

function requirePdfOwner(isCurrent: () => boolean): void {
  if (isCurrent()) return;
  const error = new Error("PDF operation is no longer active");
  error.name = "AbortError";
  throw error;
}

function resolvePdfEndpoint(requested: string | undefined): string {
  let configuredOrigin: string | null = null;
  for (const value of [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !parsed.username &&
        !parsed.password
      ) {
        configuredOrigin = parsed.origin;
        break;
      }
    } catch {}
  }
  if (!configuredOrigin) throw new Error("EXPO_PUBLIC_API_URL must be a trusted HTTP(S) API URL");
  const candidate = new URL(requested ?? "/api/pdf", configuredOrigin);
  if (candidate.origin !== configuredOrigin || candidate.username || candidate.password) {
    throw new Error("PDF endpoint must use the configured API origin");
  }
  return candidate.toString();
}

function safePdfFileName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").at(-1) ?? "document.pdf";
  const normalized = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  const base = normalized || "document.pdf";
  return (base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`).slice(0, 128);
}

export function usePdfMobile(options: { endpoint?: string } = {}) {
  const endpoint = resolvePdfEndpoint(options.endpoint);
  const ownOperation = useAuthOwnedEffect();
  type PdfInput = {
    template: "invoice" | "certificate" | "agreement";
    data: unknown;
    locale?: string;
    fileName?: string;
  };
  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async ({ input, isCurrent }: { input: PdfInput; isCurrent: () => boolean }) => {
      requirePdfOwner(isCurrent);
      const cookie = Platform.OS === "web" ? null : await authClient.getCookie();
      requirePdfOwner(isCurrent);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(cookie ? { cookie } : {}),
      };
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`PDF failed: ${res.status}`);
      const json: unknown = await res.json();
      requirePdfOwner(isCurrent);
      if (!json || typeof json !== "object" || Array.isArray(json))
        throw new Error("Invalid PDF response");
      const pdfBase64 = Reflect.get(json, "pdfBase64");
      const responseFileName = Reflect.get(json, "fileName");
      if (typeof pdfBase64 !== "string") throw new Error("Invalid PDF response");
      const fileName = safePdfFileName(
        typeof responseFileName === "string"
          ? responseFileName
          : (input.fileName ?? `${input.template}.pdf`),
      );
      if (Platform.OS === "web") {
        const bytes = Uint8Array.from(atob(pdfBase64), (character) => character.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return url;
      }
      const sharingAvailable = await Sharing.isAvailableAsync();
      requirePdfOwner(isCurrent);
      const file = new File(Paths.cache, fileName);
      file.write(pdfBase64, { encoding: "base64" });
      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: fileName });
      }
      requirePdfOwner(isCurrent);
      return file.uri;
    },
  });
  const generateAndShare = useCallback(
    async (input: PdfInput) => {
      const isCurrent = ownOperation();
      requirePdfOwner(isCurrent);
      return mutation.mutateAsync({ input, isCurrent });
    },
    [mutation.mutateAsync, ownOperation],
  );

  const ownsState = mutation.variables?.isCurrent() ?? true;
  return {
    generateAndShare,
    loading: ownsState && mutation.isPending,
    error: ownsState ? (mutation.error?.message ?? null) : null,
  };
}
