import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import type { Auth as BetterAuthServer } from "better-auth";

declare global {
  // eslint-disable-next-line no-var
  var waitUntil: ((promise: Promise<unknown>) => void) | undefined;
}

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { transactionalAccountDeletion } from "./account-deletion";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { magicLink } from "better-auth/plugins/magic-link";
import { ac, roles } from "./access";
import { env } from "@repo/config/server";

import {
  resolveEmailLocale,
  sendEmail,
  transactionalEmailSubject,
  ResetPasswordEmail,
  VerifyEmail,
  MagicLinkEmail,
} from "@repo/email/server";
import {
  db,
  accounts,
  invitations,
  members,
  organizationRoles,
  organizations,
  passkeys,
  rateLimits,
  sessions,
  teamMembers,
  teams,
  users,
  verifications,
  twoFactors,
} from "@repo/database";

if (env.BETTER_AUTH_URL.includes("localhost")) {
  console.warn(
    "[ghostinit] BETTER_AUTH_URL is still set to localhost. Change it to your production URL before deploying.",
  );
}

if (
  env.BETTER_AUTH_SECRET.length < 32 ||
  env.BETTER_AUTH_SECRET.startsWith("REPLACE_WITH") ||
  env.BETTER_AUTH_SECRET === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS"
) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 characters",
  );
}

const isHttps = env.BETTER_AUTH_URL.startsWith("https://");

type AppAdminOptions = {
  ac: typeof ac;
  roles: typeof roles;
  adminRoles: ("admin" | "superAdmin")[];
};
type AdminPlugin = ReturnType<typeof admin<AppAdminOptions>>;
type PortableAuthOptions = BetterAuthOptions & { plugins: [AdminPlugin] };
interface AdminCreationAuthContext {
  generateId(options: { model: "user" | "account"; size?: number }): string | false;
  password: {
    hash(password: string): Promise<string>;
    config: { minPasswordLength: number; maxPasswordLength: number };
  };
}
export type Auth = Pick<BetterAuthServer<PortableAuthOptions>, "handler" | "api"> & {
  readonly $context: Promise<AdminCreationAuthContext>;
};

type AuthRateLimitRule = {
  window: number;
  max: number;
};

type AuthNetworkSecurityPolicy = {
  trustedProxyHeaders: boolean;
  ipAddress: {
    ipAddressHeaders: string[];
    disableIpTracking: false;
  };
};

function isLocalAuthHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    (hostname.startsWith("127.") && isValidIpv4Address(hostname)) ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function requireCanonicalAuthOrigin(baseURL: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid absolute HTTP(S) origin");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("BETTER_AUTH_URL must use HTTP(S)");
  }
  if (
    baseURL !== baseURL.trim() ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    baseURL.includes("?") ||
    baseURL.includes("#") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "BETTER_AUTH_URL must be a canonical origin without credentials, path, query, or fragment",
    );
  }
  if (parsed.protocol !== "https:" && !isLocalAuthHostname(parsed.hostname)) {
    throw new Error("BETTER_AUTH_URL must use HTTPS unless it targets a loopback development host");
  }
  return parsed;
}

function isValidIpv4Address(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) &&
        (part === "0" || !part.startsWith("0")) &&
        Number(part) >= 0 &&
        Number(part) <= 255,
    )
  );
}

function isValidIpLiteral(value: string): boolean {
  if (!value || value !== value.trim() || value.includes(",")) return false;
  if (isValidIpv4Address(value)) return true;
  if (!value.includes(":") || /[^0-9a-fA-F:.]/.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

function resolveAuthNetworkSecurity(
  baseURL: string,
  trustedProxyValue: string | undefined,
): AuthNetworkSecurityPolicy {
  const trustedProxyHeaders = trustedProxyValue === "true";
  const hostname = requireCanonicalAuthOrigin(baseURL).hostname;
  if (!trustedProxyHeaders && !isLocalAuthHostname(hostname)) {
    throw new Error(
      "TRUSTED_PROXY must be true for a non-local Better Auth URL, and the trusted proxy must overwrite X-Forwarded-For",
    );
  }
  return {
    trustedProxyHeaders,
    ipAddress: {
      ipAddressHeaders: trustedProxyHeaders ? ["x-forwarded-for"] : [],
      disableIpTracking: false,
    },
  };
}

function enforceTrustedAuthClientIp(
  request: Request,
  currentRule: AuthRateLimitRule,
  policy: AuthNetworkSecurityPolicy,
): AuthRateLimitRule {
  if (!policy.trustedProxyHeaders) return currentRule;
  const clientIp = request.headers.get("x-forwarded-for");
  if (!clientIp || !isValidIpLiteral(clientIp)) {
    throw new Error("The trusted proxy did not supply one valid X-Forwarded-For value");
  }
  return currentRule;
}

const authNetworkSecurity = resolveAuthNetworkSecurity(env.BETTER_AUTH_URL, env.TRUSTED_PROXY);

function profileUpdateValidation(): BetterAuthPlugin {
  return {
    id: "ghostinit-profile-update-validation",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/update-user",
          handler: createAuthMiddleware(async (context) => {
            if (context.body?.name === undefined) return;
            const name = typeof context.body.name === "string" ? context.body.name.trim() : "";
            if (name.length < 1 || name.length > 50) {
              throw new APIError("BAD_REQUEST", {
                code: "INVALID_NAME",
                message: "Name must be between 1 and 50 characters.",
              });
            }
            return { context: { ...context, body: { ...context.body, name } } };
          }),
        },
      ],
    },
  };
}

const configuredAuth = betterAuth({
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    transaction: true,
    schema: {
      user: users,
      account: accounts,
      session: sessions,
      verification: verifications,
      passkey: passkeys,
      twoFactor: twoFactors,
      rateLimit: rateLimits,
      organization: organizations,
      member: members,
      invitation: invitations,
      team: teams,
      teamMember: teamMembers,
      organizationRole: organizationRoles,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignInAfterRegistration: false,
    revokeSessionsOnPasswordReset: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }, request) => {
      const appName = env.APP_NAME;
      const locale = resolveEmailLocale(request?.headers);
      const subject = transactionalEmailSubject("password-reset", locale, appName);
      await sendEmail(user.email, subject, ResetPasswordEmail, { link: url, appName, locale });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }, request) => {
      const locale = resolveEmailLocale(request?.headers);
      await sendEmail(
        user.email,
        transactionalEmailSubject("verification", locale, env.APP_NAME),
        VerifyEmail,
        { link: url, appName: env.APP_NAME, locale },
      );
    },
  },
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID &&
    !env.GOOGLE_CLIENT_ID.startsWith("REPLACE_WITH") &&
    env.GOOGLE_CLIENT_SECRET &&
    !env.GOOGLE_CLIENT_SECRET.startsWith("REPLACE_WITH")
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(env.GITHUB_CLIENT_ID &&
    !env.GITHUB_CLIENT_ID.startsWith("REPLACE_WITH") &&
    env.GITHUB_CLIENT_SECRET &&
    !env.GITHUB_CLIENT_SECRET.startsWith("REPLACE_WITH")
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      requireLocalEmailVerified: true,
      trustedProviders: ["google", "github"],
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
    changeEmail: {
      enabled: true,
    },
  },
  session: {
    // Passkey enrollment and OAuth-only deletion are sensitive operations.
    // Keep the freshness window explicit and force their middleware to read the
    // authoritative persisted session instead of a five-minute cookie snapshot.
    freshAge: 60 * 5,
    cookieCache: {
      enabled: false,
    },
  },
  cookie: {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/two-factor/*": (request) =>
        enforceTrustedAuthClientIp(request, { window: 60, max: 5 }, authNetworkSecurity),
      "*": (request, currentRule) =>
        enforceTrustedAuthClientIp(request, currentRule, authNetworkSecurity),
    },
  },
  advanced: {
    trustedProxyHeaders: authNetworkSecurity.trustedProxyHeaders,
    ipAddress: authNetworkSecurity.ipAddress,
    backgroundTasks: {
      handler: (promise) => {
        if (typeof globalThis.waitUntil === "function") {
          globalThis.waitUntil(promise);
        }
      },
    },
  },
  plugins: [
    transactionalAccountDeletion(),
    profileUpdateValidation(),
    expo(),
    admin({ ac, roles, adminRoles: ["admin", "superAdmin"] }),
    twoFactor({
      issuer: env.BETTER_AUTH_URL,
      twoFactorCookieMaxAge: 600,
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
    }),

    magicLink({
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }, context) => {
        const locale = resolveEmailLocale(context?.request?.headers);
        await sendEmail(
          email,
          transactionalEmailSubject("magic-link", locale, env.APP_NAME),
          MagicLinkEmail,
          { link: url, appName: env.APP_NAME, locale },
        );
      },
    }),
    passkey(),
    organization({
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      teams: { enabled: true },
      dynamicAccessControl: { enabled: true },
    }),
    nextCookies(),
  ],
  trustedOrigins: [env.BETTER_AUTH_URL, "pharmeazor://"],
});

export const auth: Auth = configuredAuth;

export async function getRequestUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}
