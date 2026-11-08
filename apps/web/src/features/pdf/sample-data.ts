export type PdfTemplate = "invoice" | "certificate" | "agreement";
type PdfSampleKey =
  | "sample.customer"
  | "sample.recipient"
  | "sample.invoiceItem"
  | "sample.invoiceNotes"
  | "sample.certificateReason"
  | "sample.agreementTitle"
  | "sample.provider"
  | "sample.customerRole"
  | "sample.deliverService"
  | "sample.protectInformation";

const PDF_SAMPLE_ENGLISH: Readonly<Record<PdfSampleKey, string>> = {
  "sample.customer": "Example customer",
  "sample.recipient": "Example recipient",
  "sample.invoiceItem": "Pro subscription",
  "sample.invoiceNotes": "Generated from the authenticated PDF workspace.",
  "sample.certificateReason": "completed the secure PDF workflow",
  "sample.agreementTitle": "Service agreement",
  "sample.provider": "Provider",
  "sample.customerRole": "Customer",
  "sample.deliverService": "Deliver the documented service.",
  "sample.protectInformation": "Protect customer information.",
};

export function samplePdfData(
  template: PdfTemplate,
  translate: (key: PdfSampleKey) => string = (key) => PDF_SAMPLE_ENGLISH[key],
): Record<string, unknown> {
  const now = new Date();
  if (template === "invoice") {
    return {
      invoiceNumber: "INV-DEMO-001",
      issuedAt: now.toISOString(),
      dueDate: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
      from: { name: "GhostInit Studio", email: "billing@example.com" },
      to: { name: translate("sample.customer"), email: "customer@example.com" },
      items: [{ description: translate("sample.invoiceItem"), quantity: 1, unitPrice: 49 }],
      currency: "USD",
      notes: translate("sample.invoiceNotes"),
    };
  }
  if (template === "certificate") {
    return {
      recipientName: translate("sample.recipient"),
      recipientEmail: "recipient@example.com",
      issuerName: "GhostInit Academy",
      reason: translate("sample.certificateReason"),
      issuedAt: now.toISOString(),
    };
  }
  return {
    title: translate("sample.agreementTitle"),
    subtitle: "GhostInit",
    parties: [
      {
        name: "GhostInit Studio",
        email: "legal@example.com",
        roleLabel: translate("sample.provider"),
        color: "#2563eb",
      },
      {
        name: translate("sample.customer"),
        email: "customer@example.com",
        roleLabel: translate("sample.customerRole"),
        color: "#059669",
      },
    ],
    effectiveDate: now.toISOString(),
    expiryDate: new Date(now.getTime() + 365 * 86_400_000).toISOString(),
    terms: [translate("sample.deliverService"), translate("sample.protectInformation")],
  };
}
