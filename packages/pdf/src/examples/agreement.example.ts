import type { AgreementData } from "../templates/agreement";

export const exampleAgreementData: AgreementData = {
  title: "Service Agreement",
  subtitle: "ghostinit",
  parties: [
    { name: "Acme Corp", email: "legal@acme.com", roleLabel: "Provider", color: "#2563eb" },
    { name: "Client LLC", email: "client@example.com", roleLabel: "Client", color: "#059669" },
  ],
  effectiveDate: new Date(),
  expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  terms: [
    "Provider will deliver services as described.",
    "Client will pay per invoice terms.",
    "Either party may terminate with 30 days notice.",
  ],
  notes: "This is a sample agreement for demonstration purposes.",
};
