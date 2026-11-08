import {
  listSubscriptionsService,
  type BillingSnapshot,
  type BillingSnapshotRepositoryPort,
} from "@repo/services/billing";
import type { Result } from "@repo/kernel";

export async function listSubscriptionsUseCase(
  userId: string,
  repository: BillingSnapshotRepositoryPort,
): Promise<Result<BillingSnapshot, Error>> {
  return listSubscriptionsService(userId, repository);
}
