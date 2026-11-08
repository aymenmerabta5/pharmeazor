import type { InvoiceData } from "../templates/invoice";

export const exampleInvoiceData: InvoiceData = {
  invoiceNumber: "INV-2025-001",
  issuedAt: new Date(),
  dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  from: { name: "Acme Corp", email: "hello@acme.com", address: "123 Business St, Algiers, DZ" },
  to: { name: "Client LLC", email: "client@example.com", address: "456 Client Ave, Oran, DZ" },
  items: [
    { description: "Design System Setup", quantity: 1, unitPrice: 1200 },
    { description: "Monthly Retainer — Development", quantity: 2, unitPrice: 2500 },
  ],
  currency: "USD",
  notes: "Payment due within 14 days. Thank you!",
};
