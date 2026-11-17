import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, manualCreditLedger } from "@repo/database";
import { ManualPaymentError } from "../../domain/manual-payment";
import type {
  WalletPurchaseCommand,
  WalletPurchaseResult,
  WalletRepositoryPort,
} from "../../domain/wallet";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type QueryConnection = Pick<Transaction, "select">;

/**
 * Sum the signed ledger in PostgreSQL, never in JavaScript.
 *
 * A purchase is a negative row, so this is the spendable balance, not a
 * lifetime total. The check catches a corrupted graph before it reaches UI.
 */
export async function walletBalance(connection: QueryConnection, ownerId: string): Promise<number> {
  const [total] = await connection
    .select({ amount: sql<string>`coalesce(sum(${manualCreditLedger.amountMinor}), 0)::text` })
    .from(manualCreditLedger)
    .where(eq(manualCreditLedger.ownerId, ownerId));
  const value = BigInt(total?.amount ?? "0");
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ManualPaymentError("LIMIT_EXCEEDED", "Balance is outside the supported range");
  }
  return Number(value);
}

/**
 * The Postgres wallet ledger.
 *
 * One advisory lock per account serializes approvals and purchases, so two
 * concurrent spends cannot both observe the same balance. The unique
 * (owner, request key) index is the durable idempotency guard.
 */
export const postgresWalletRepository: WalletRepositoryPort = {
  async balance(ownerId) {
    return await db.transaction(async (transaction) => {
      // A read does not need the advisory lock, but it does need one snapshot.
      return await walletBalance(transaction, ownerId);
    });
  },

  async purchase(command: WalletPurchaseCommand, grant): Promise<WalletPurchaseResult> {
    return await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${"wallet-owner:" + command.ownerId}, 0))`,
      );
      const [existing] = await transaction
        .select({
          planId: manualCreditLedger.planId,
          amountMinor: manualCreditLedger.amountMinor,
        })
        .from(manualCreditLedger)
        .where(
          and(
            eq(manualCreditLedger.ownerId, command.ownerId),
            eq(manualCreditLedger.requestKey, command.requestKey),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.planId !== command.planId || existing.amountMinor !== -command.amountMinor) {
          throw new ManualPaymentError(
            "CONFLICT",
            "This purchase key was already used for a different plan",
          );
        }
        return {
          balanceMinor: await walletBalance(transaction, command.ownerId),
          duplicate: true,
          periodEnd: null,
        };
      }
      const balance = await walletBalance(transaction, command.ownerId);
      if (balance < command.amountMinor) {
        throw new ManualPaymentError(
          "INSUFFICIENT_FUNDS",
          "The wallet balance does not cover this plan",
        );
      }
      await transaction.insert(manualCreditLedger).values({
        ownerId: command.ownerId,
        planId: command.planId,
        amountMinor: -command.amountMinor,
        currency: "DZD",
        kind: "purchase",
        requestKey: command.requestKey,
      });
      // The grant runs on the same connection: a failure rolls the debit back.
      const periodEnd = await grant(transaction);
      return {
        balanceMinor: balance - command.amountMinor,
        duplicate: false,
        periodEnd,
      };
    });
  },
};

export function createWalletRepository(): WalletRepositoryPort {
  return postgresWalletRepository;
}
