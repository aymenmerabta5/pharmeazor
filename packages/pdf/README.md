# @repo/pdf

Server-side PDF generation via `@react-pdf/renderer` + `qrcode` + `dejavu-fonts-ttf`.

## Templates

- `InvoiceTemplate` — A4 portrait, items table, totals, notes
- `CertificateTemplate` — A4 landscape, border styles, QR verification
- `AgreementTemplate` — A4 landscape, multi-party, signatures

## Borders

`classic | formal | minimal | modern | ornate | premium` in `src/borders/`

## Usage (server)

```ts
import {
  generateQRCodeDataUrl,
  generateVerificationCode,
  InvoiceTemplate,
  renderPdfToBuffer,
} from "@repo/pdf";
import { createElement } from "react";

const code = generateVerificationCode();
const qr = await generateQRCodeDataUrl(`https://example.com/verify/${code}`);
const buffer = await renderPdfToBuffer(
  createElement(InvoiceTemplate, {
    data: { ...exampleInvoiceData, verificationCode: code, qrCodeDataUrl: qr },
  }),
);
// buffer is Node Buffer — persist to S3 or return base64
```

## API route (Next.js)

The generated `/api/pdf` route requires an authenticated session before it
consumes the body. It accepts only bounded JSON, enforces depth/item/text and
per-actor admission limits, caps rendered output, and returns generic internal
errors. The generated admission counter is deliberately process-local: run one
web replica (the Fly profile constrains this), keep Docker at one replica, or
replace it with a shared transactional admission adapter before scaling. The
capability resolver rejects Vercel because a serverless fleet cannot enforce
these limits globally. Do not replace the route with an unbounded
`request.json()` handler.

Use `renderPdfToBuffer` for server rendering. It admits at most two calls,
serializes font setup and rendering, and reloads local font faces for each
document so Arabic shaping state cannot leak between requests. A full renderer
returns `PdfRenderBusyError`, mapped by the HTTP route to a retryable 429.

## Client (web)

```ts
import { usePdf } from "@repo/pdf/client/usePdf";
const { generate } = usePdf();
await generate({ template: "invoice", data: exampleInvoiceData });
```

## Expo (mobile) — recommended

Do NOT bundle `@react-pdf/renderer` on device. Call the server endpoint and use expo-file-system + expo-sharing:

```ts
import { usePdfMobile } from "@/hooks/usePdf";
await generateAndShare({ template: "certificate", data: exampleCertificateData });
```

## Desktop (Electron)

Same HTTP path as web. Electron main is Node so you _can_ import
`@repo/pdf` directly in main process, but prefer HTTP for parity.

## Single mode

Import server APIs from `@/server/pdf/src` instead of `@repo/pdf`. The web-only
hook is emitted at `@/hooks/usePdf`; client code is never placed below
`src/server`.

## GenerationMatrix

Every `.ts/.tsx` parses and relative imports resolve for both `monorepo` and `single` via `oxc-parser`.
