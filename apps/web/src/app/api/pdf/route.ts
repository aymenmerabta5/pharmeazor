import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import type { ComponentType } from "react";
import { createContext } from "@repo/api";
import {
  InvoiceTemplate,
  CertificateTemplate,
  AgreementTemplate,
  renderPdfToBuffer,
  PdfRenderBusyError,
} from "@repo/pdf";

const MAX_PDF_REQUEST_BYTES = 64 * 1024;
const MAX_PDF_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_PDF_RENDERS = 2;
const PDF_RATE_WINDOW_MS = 60_000;
const MAX_PDF_RENDERS_PER_WINDOW = 5;
const PDF_BODY_TIMEOUT_MS = 10_000;
const PDF_RENDER_TIMEOUT_MS = 15_000;

class PdfRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

class PdfRenderTimeoutError extends PdfRequestError {
  constructor() {
    super(504, "PDF generation timed out");
  }
}

type PdfRequestBody = {
  template: "invoice" | "certificate" | "agreement";
  data: unknown;
  locale?: string;
};

interface PdfAuthorizationContext {
  readonly user?: {
    readonly id: string;
    readonly banned?: boolean | null;
  };
}

let activePdfRenders = 0;
const pdfRate = new Map<string, { count: number; windowStartedAt: number }>();

function requirePdfActor(context: PdfAuthorizationContext): string {
  if (!context.user?.id) throw new PdfRequestError(401, "Unauthorized");
  if (context.user.banned === true) {
    throw new PdfRequestError(403, "Suspended accounts cannot generate PDFs");
  }
  return context.user.id;
}

async function resolvePdfActor(headers: Headers): Promise<string> {
  try {
    return requirePdfActor(await createContext(headers));
  } catch (error) {
    if (error instanceof PdfRequestError) throw error;
    throw new PdfRequestError(503, "Authentication service unavailable");
  }
}

function validateJsonBudget(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > 2_000 || current.depth > 10) {
      throw new PdfRequestError(400, "PDF data is too complex");
    }
    const value = current.value;
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      if (value.length > 10_000) throw new PdfRequestError(400, "PDF text is too long");
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new PdfRequestError(400, "PDF data contains an invalid number");
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 100) throw new PdfRequestError(400, "PDF data contains too many items");
      for (const item of value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (typeof value !== "object")
      throw new PdfRequestError(400, "PDF data must be JSON-compatible");
    const entries = Object.entries(value);
    if (entries.length > 100) throw new PdfRequestError(400, "PDF data contains too many fields");
    for (const [key, child] of entries) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new PdfRequestError(400, "PDF data contains a forbidden field");
      }
      if (key === "logoUrl" || key === "issuerLogoUrl" || key === "qrCodeDataUrl") {
        if (child !== undefined && child !== null && child !== "") {
          throw new PdfRequestError(400, "Client-supplied PDF images are not supported");
        }
      }
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function pdfRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PdfRequestError(400, "PDF template data must be an object");
  }
  return value as Record<string, unknown>;
}

function pdfDate(value: unknown, field: string, required: boolean): Date | null | undefined {
  if (value === null && !required) return null;
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new PdfRequestError(400, `PDF ${field} must be an ISO date`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new PdfRequestError(400, `PDF ${field} is invalid`);
  return date;
}

function normalizePdfData(
  template: PdfRequestBody["template"],
  value: unknown,
): Record<string, unknown> {
  const source = pdfRecord(value);
  const data: Record<string, unknown> = { ...source };
  if (template === "invoice") {
    data.issuedAt = pdfDate(source.issuedAt, "issuedAt", true);
    if (source.dueDate !== undefined) data.dueDate = pdfDate(source.dueDate, "dueDate", false);
  } else if (template === "certificate") {
    if (source.issuedAt !== undefined) data.issuedAt = pdfDate(source.issuedAt, "issuedAt", false);
    if (source.validUntil !== undefined)
      data.validUntil = pdfDate(source.validUntil, "validUntil", false);
  } else {
    data.effectiveDate = pdfDate(source.effectiveDate, "effectiveDate", true);
    if (source.expiryDate !== undefined)
      data.expiryDate = pdfDate(source.expiryDate, "expiryDate", false);
  }
  return data;
}

async function readPdfRequest(request: Request): Promise<PdfRequestBody> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json")
    throw new PdfRequestError(415, "Content-Type must be application/json");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_PDF_REQUEST_BYTES)) {
    throw new PdfRequestError(413, "PDF request is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new PdfRequestError(400, "PDF request body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel("PDF request body timeout").catch(() => undefined);
  }, PDF_BODY_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PDF_REQUEST_BYTES) {
        void reader.cancel("PDF request limit exceeded").catch(() => undefined);
        throw new PdfRequestError(413, "PDF request is too large");
      }
      chunks.push(value);
    }
    if (timedOut) throw new PdfRequestError(408, "PDF request body timed out");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PdfRequestError(400, "PDF request contains invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PdfRequestError(400, "PDF request must be an object");
  }
  const record = parsed as Record<string, unknown>;
  const template = record.template;
  if (template !== "invoice" && template !== "certificate" && template !== "agreement") {
    throw new PdfRequestError(400, "Unknown PDF template");
  }
  if (!("data" in record)) throw new PdfRequestError(400, "PDF data is required");
  if (
    record.locale !== undefined &&
    (typeof record.locale !== "string" || !/^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/.test(record.locale))
  ) {
    throw new PdfRequestError(400, "Invalid PDF locale");
  }
  validateJsonBudget(record.data);
  return {
    template,
    data: normalizePdfData(template, record.data),
    ...(typeof record.locale === "string" ? { locale: record.locale } : {}),
  };
}

async function renderWithDeadline<T>(render: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      render,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new PdfRenderTimeoutError()), PDF_RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function admitPdfRender(actorId: string): () => void {
  const now = Date.now();
  for (const [key, value] of pdfRate) {
    if (now - value.windowStartedAt >= PDF_RATE_WINDOW_MS) pdfRate.delete(key);
  }
  if (pdfRate.size > 10_000) throw new PdfRequestError(503, "PDF service is busy");
  const current = pdfRate.get(actorId);
  const entry =
    !current || now - current.windowStartedAt >= PDF_RATE_WINDOW_MS
      ? { count: 0, windowStartedAt: now }
      : current;
  if (entry.count >= MAX_PDF_RENDERS_PER_WINDOW || activePdfRenders >= MAX_ACTIVE_PDF_RENDERS) {
    throw new PdfRequestError(429, "PDF generation limit reached");
  }
  entry.count += 1;
  pdfRate.set(actorId, entry);
  activePdfRenders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activePdfRenders = Math.max(0, activePdfRenders - 1);
  };
}

function safePdfError(error: unknown): { status: number; message: string } {
  if (error instanceof PdfRenderBusyError) return { status: 429, message: error.message };
  if (error instanceof PdfRequestError) return { status: error.status, message: error.message };
  console.error("[pdf] generation failed", {
    error: error instanceof Error ? error.name : "UnknownError",
  });
  return { status: 500, message: "PDF generation failed" };
}

const templates: Record<string, unknown> = {
  invoice: InvoiceTemplate,
  certificate: CertificateTemplate,
  agreement: AgreementTemplate,
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let release: (() => void) | undefined;
  try {
    const actorId = await resolvePdfActor(req.headers);
    release = admitPdfRender(actorId);
    const body = await readPdfRequest(req);
    const Comp = templates[body.template] as ComponentType<{ data: unknown; locale?: string }>;
    const render = renderPdfToBuffer(createElement(Comp, { data: body.data, locale: body.locale }));
    let buffer: Awaited<typeof render>;
    try {
      buffer = await renderWithDeadline(render);
    } catch (error) {
      if (error instanceof PdfRenderTimeoutError) {
        const lateRelease = release;
        release = undefined;
        void render.finally(() => lateRelease?.()).catch(() => undefined);
      }
      throw error;
    }
    if (buffer.byteLength > MAX_PDF_OUTPUT_BYTES) {
      throw new PdfRequestError(413, "Generated PDF is too large");
    }
    const pdfBase64 = Buffer.from(buffer).toString("base64");
    return NextResponse.json(
      { pdfBase64, fileName: `${body.template}.pdf` },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const safe = safePdfError(error);
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } finally {
    release?.();
  }
}
