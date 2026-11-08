import "server-only";
import type { Result } from "@repo/kernel";
import { err, ok } from "@repo/kernel";
export interface BillingSnapshot {
  subscriptions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  usageEvents: Array<Record<string, unknown>>;
  licenseKeys: Array<Record<string, unknown>>;
}
export interface BillingSnapshotRepositoryPort {
  findSnapshot(userId: string): Promise<BillingSnapshot>;
}
export async function listSubscriptionsService(
  userId: string,
  repository: BillingSnapshotRepositoryPort,
): Promise<Result<BillingSnapshot, Error>> {
  try {
    return ok(await repository.findSnapshot(userId));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
