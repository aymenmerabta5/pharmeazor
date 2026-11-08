"use client";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

export interface UsePdfOptions {
  endpoint?: string;
  captureOwner?: () => () => boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePdfOwner(isCurrent: () => boolean): void {
  if (isCurrent()) return;
  const error = new Error("PDF operation is no longer active");
  error.name = "AbortError";
  throw error;
}

function safePdfFileName(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").at(-1) ?? "document.pdf";
  const normalized = leaf.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  const base = normalized || "document.pdf";
  return (base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`).slice(0, 128);
}

function resolvePdfEndpoint(value: string): string {
  if (typeof window === "undefined") throw new Error("PDF generation requires a browser session");
  const candidate = new URL(value, window.location.origin);
  if (candidate.origin !== window.location.origin || candidate.username || candidate.password) {
    throw new Error("PDF endpoint must use the current application origin");
  }
  return candidate.toString();
}

export function usePdf(options: UsePdfOptions = {}) {
  const endpoint = options.endpoint ?? "/api/pdf";
  const captureOwner = options.captureOwner;
  const lifetime = useRef({ mounted: false, generation: 0 });
  useLayoutEffect(() => {
    lifetime.current.mounted = true;
    lifetime.current.generation += 1;
    return () => {
      lifetime.current.mounted = false;
      lifetime.current.generation += 1;
    };
  }, []);
  const ownOperation = useCallback(() => {
    const generation = lifetime.current.generation;
    const ownsAuth = captureOwner?.();
    return () =>
      lifetime.current.mounted &&
      lifetime.current.generation === generation &&
      (ownsAuth?.() ?? true);
  }, [captureOwner]);

  type PdfInput = {
    template: "invoice" | "certificate" | "agreement";
    data: unknown;
    locale?: string;
    fileName?: string;
  };
  const mutation = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: async ({
      input,
      preview,
      isCurrent,
    }: {
      input: PdfInput;
      preview: boolean;
      isCurrent: () => boolean;
    }) => {
      requirePdfOwner(isCurrent);
      const res = await fetch(resolvePdfEndpoint(endpoint), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`PDF generation failed: ${res.status}`);
      const json: unknown = await res.json();
      requirePdfOwner(isCurrent);
      if (!isRecord(json) || typeof json.pdfBase64 !== "string")
        throw new Error("Invalid PDF response");
      const bytes = Uint8Array.from(atob(json.pdfBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (!preview) {
        const a = document.createElement("a");
        a.href = url;
        a.download = safePdfFileName(
          typeof json.fileName === "string"
            ? json.fileName
            : (input.fileName ?? `${input.template}.pdf`),
        );
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      return { response: json, url };
    },
  });

  const generate = useCallback(
    async (input: PdfInput) => {
      const isCurrent = ownOperation();
      requirePdfOwner(isCurrent);
      const { response: json } = await mutation.mutateAsync({ input, preview: false, isCurrent });
      requirePdfOwner(isCurrent);
      return json;
    },
    [mutation.mutateAsync, ownOperation],
  );

  const preview = useCallback(
    async (input: Parameters<typeof generate>[0]) => {
      const isCurrent = ownOperation();
      requirePdfOwner(isCurrent);
      const { url } = await mutation.mutateAsync({ input, preview: true, isCurrent });
      requirePdfOwner(isCurrent);
      return url;
    },
    [mutation.mutateAsync, ownOperation],
  );

  const ownsState = mutation.variables?.isCurrent() ?? true;
  return {
    generate,
    preview,
    loading: ownsState && mutation.isPending,
    error: ownsState ? (mutation.error?.message ?? null) : null,
  };
}
