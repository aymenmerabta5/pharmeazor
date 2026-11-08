import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import {
  adminClient,
  twoFactorClient,
  magicLinkClient,
  organizationClient,
} from "better-auth/client/plugins";
import { ac, roles } from "./access";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect(context) {
        if (context.twoFactorMethods?.includes("totp") && typeof window !== "undefined") {
          window.location.href = "/2fa";
        }
      },
    }),
    adminClient({ ac, roles }),
    magicLinkClient(),
    passkeyClient(),
    organizationClient(),
  ],
});
