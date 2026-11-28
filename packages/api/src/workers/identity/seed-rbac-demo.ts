/**
 * Seed the local role-based-access demo accounts.
 *
 * Creates three verified credential accounts in the development database:
 *
 *   admin@pharmeazor.local       role "admin"  no subscription
 *   subscriber@pharmeazor.local  role "user"   active Pro subscription
 *   guest@pharmeazor.local       role "user"   no subscription
 *
 * The script is idempotent: re-running it restores the password, role, and
 * subscription window instead of creating duplicates. It refuses to touch a
 * non-local auth origin unless SEED_ALLOW_NON_LOCAL=1 is explicit, because the
 * shared demo password must never become a production credential.
 *
 * Run it with: bun run seed:rbac-demo
 */
import { and, eq } from "drizzle-orm";
import { auth } from "@repo/auth/server";
import { accounts, db, pool, users } from "@repo/database";
import { addBillingInterval, subscriptions } from "@repo/billing";

type DemoRole = "admin" | "user";

interface DemoAccount {
  readonly email: string;
  readonly name: string;
  readonly planId: string | null;
  readonly role: DemoRole;
}

const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: "admin@pharmeazor.local",
    name: "Platform Admin",
    planId: null,
    role: "admin",
  },
  {
    email: "subscriber@pharmeazor.local",
    name: "Subscribed Pharmacist",
    planId: "pro",
    role: "user",
  },
  {
    email: "guest@pharmeazor.local",
    name: "Unsubscribed Pharmacist",
    planId: null,
    role: "user",
  },
];

const DEFAULT_DEMO_PASSWORD = "Pharmeazor!Demo2026";
const SUBSCRIPTION_PROVIDER = "manual" as const;

function requireGeneratedId(value: string | false, model: "user" | "account"): string {
  if (value !== false) return value;
  throw new Error(`Better Auth did not generate an id for the ${model} model`);
}

function isLocalAuthOrigin(): boolean {
  const raw = process.env.BETTER_AUTH_URL?.trim();
  if (!raw) throw new Error("BETTER_AUTH_URL is not configured");
  const hostname = new URL(raw).hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

async function seed(): Promise<void> {
  const local = isLocalAuthOrigin();
  if (!local && process.env.SEED_ALLOW_NON_LOCAL !== "1") {
    throw new Error(
      "Refusing to seed demo credentials for a non-local BETTER_AUTH_URL. " +
        "Set SEED_ALLOW_NON_LOCAL=1 only for a disposable environment.",
    );
  }
  const configuredPassword = process.env.SEED_DEMO_PASSWORD?.trim();
  if (!local && !configuredPassword) {
    throw new Error("SEED_DEMO_PASSWORD is required when seeding a non-local environment");
  }
  const password = configuredPassword || DEFAULT_DEMO_PASSWORD;
  const authContext = await auth.$context;
  if (
    password.length < authContext.password.config.minPasswordLength ||
    password.length > authContext.password.config.maxPasswordLength
  ) {
    throw new Error("SEED_DEMO_PASSWORD does not satisfy the configured identity policy");
  }
  const passwordHash = await authContext.password.hash(password);
  const now = new Date();

  await db.transaction(async (transaction) => {
    for (const account of DEMO_ACCOUNTS) {
      const email = account.email.toLowerCase();
      const [existing] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const userId =
        existing?.id ?? requireGeneratedId(authContext.generateId({ model: "user" }), "user");

      if (existing) {
        await transaction
          .update(users)
          .set({
            name: account.name,
            role: account.role,
            emailVerified: true,
            banned: false,
            banReason: null,
            banExpires: null,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
      } else {
        await transaction.insert(users).values({
          id: userId,
          name: account.name,
          email,
          emailVerified: true,
          image: null,
          role: account.role,
          banned: false,
          banReason: null,
          banExpires: null,
          twoFactorEnabled: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      const [credential] = await transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
        .limit(1);
      if (credential) {
        await transaction
          .update(accounts)
          .set({ password: passwordHash, updatedAt: now })
          .where(eq(accounts.id, credential.id));
      } else {
        await transaction.insert(accounts).values({
          id: requireGeneratedId(authContext.generateId({ model: "account" }), "account"),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (account.planId === null) continue;
      const periodEnd = addBillingInterval(now, "year", 1);
      const [existingSubscription] = await transaction
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.planId, account.planId)))
        .limit(1);
      if (existingSubscription) {
        await transaction
          .update(subscriptions)
          .set({
            provider: SUBSCRIPTION_PROVIDER,
            status: "active",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            autoRenew: false,
            cancelAtPeriodEnd: false,
            trialEnd: null,
            updatedAt: now,
          })
          .where(eq(subscriptions.id, existingSubscription.id));
      } else {
        await transaction.insert(subscriptions).values({
          userId,
          planId: account.planId,
          provider: SUBSCRIPTION_PROVIDER,
          providerSubscriptionId: `seed-demo:${userId}:${account.planId}`,
          status: "active",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          autoRenew: false,
          cancelAtPeriodEnd: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  });

  console.log("Demo accounts are ready:");
  for (const account of DEMO_ACCOUNTS) {
    console.log(
      `  ${account.role.padEnd(5)}  ${account.email.padEnd(30)}  ${
        account.planId ? `${account.planId} subscription` : "no subscription"
      }`,
    );
  }
  console.log(`Shared password: ${password}`);
}

try {
  await seed();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
