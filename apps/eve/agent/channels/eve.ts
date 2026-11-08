import { eveChannel } from "eve/channels/eve";
import { verifyHttpBasic, withAuthChallenges, type AuthFn } from "eve/channels/auth";

const PROXY_USERNAME = "ghostinit-web-proxy";

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  if (!value || value.length < 32 || value.startsWith("REPLACE_WITH")) return null;
  return value;
}

const proxyAuth: AuthFn<Request> = withAuthChallenges(
  (request) => {
    const password = configuredSecret();
    if (!password) return null;
    const result = verifyHttpBasic(request.headers.get("authorization"), {
      username: PROXY_USERNAME,
      password,
    });
    if (!result.ok) return null;
    return { ...result.sessionAuth, principalType: "service" };
  },
  [{ scheme: "Basic", parameters: { realm: "ghostinit-eve", charset: "UTF-8" } }],
);

export default eveChannel({
  auth: [proxyAuth],
  trustedForwarders: (forwarder) =>
    forwarder.authenticator === "http-basic" &&
    forwarder.principalId === PROXY_USERNAME &&
    forwarder.principalType === "service",
});
