// Generated from GhostInit's versioned identity data-model blueprint.
export const identityTarget = "postgres" as const;
export const selectedIdentityPlugins = ["admin", "two-factor", "passkey", "organization"] as const;
export const rejectedIdentityPlugins = {} as const;
export const identitySchemaLimitations = [
  "The renderer is pinned to the audited Better Auth package schema; rerun the conformance tests whenever a pinned auth package changes.",
  "Trusted-device grants are Better Auth verification records plus signed cookies, not a standalone table.",
  "@better-auth/passkey 1.6.33 verifies ceremonies with requireUserVerification=false; the generated surface does not claim biometric or hardware user-verification enforcement.",
] as const;
export const identityPasskeyClientBindings = {
  nextjs: {
    status: "supported",
    database: "postgres",
    target: "nextjs",
    operationIds: [
      "identity.passkey.authenticate",
      "identity.passkey.delete",
      "identity.passkey.list",
      "identity.passkey.register",
      "identity.passkey.rename",
    ],
    acceptanceOperationIds: [
      "identity.passkey.authenticate.v1",
      "identity.passkey.delete.v1",
      "identity.passkey.list.v1",
      "identity.passkey.register.v1",
      "identity.passkey.rename.v1",
    ],
  },
  "tanstack-start": {
    status: "supported",
    database: "postgres",
    target: "tanstack-start",
    operationIds: [
      "identity.passkey.authenticate",
      "identity.passkey.delete",
      "identity.passkey.list",
      "identity.passkey.register",
      "identity.passkey.rename",
    ],
    acceptanceOperationIds: [
      "identity.passkey.authenticate.v1",
      "identity.passkey.delete.v1",
      "identity.passkey.list.v1",
      "identity.passkey.register.v1",
      "identity.passkey.rename.v1",
    ],
  },
  expo: {
    status: "unsupported",
    database: "postgres",
    target: "expo",
    operationIds: [],
    acceptanceOperationIds: [],
    reason:
      "The pinned Better Auth passkey client is browser WebAuthn-only; no audited Expo native credential binding is installed.",
  },
  electron: {
    status: "unsupported",
    database: "postgres",
    target: "electron",
    operationIds: [],
    acceptanceOperationIds: [],
    reason:
      "The packaged Electron renderer uses a file/custom transport origin without an audited secure-context and RP-ID binding.",
  },
} as const;
