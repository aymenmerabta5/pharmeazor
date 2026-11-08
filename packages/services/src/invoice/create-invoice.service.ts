import "server-only";
import type { Result } from "@repo/kernel";
import { err, ok } from "@repo/kernel";
export interface InvoiceItem {
  id: string;
  unitPrice: number;
  quantity: number;
  name: string;
}
export interface CreateInvoiceInput {
  userId: string;
  items: InvoiceItem[];
}
export interface InvoiceRecord {
  id: string;
  total: number;
  status: string;
}
export interface InvoiceDeps {
  insertInvoice: (data: { userId: string; total: number }) => Promise<InvoiceRecord>;
}
export type CreateInvoiceOutput = Result<InvoiceRecord, Error>;
function calculateTotal(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}
export async function createInvoiceService(
  input: CreateInvoiceInput,
  deps: InvoiceDeps,
): Promise<CreateInvoiceOutput> {
  try {
    const total = calculateTotal(input.items);
    const record = await deps.insertInvoice({ userId: input.userId, total });
    return ok(record);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
