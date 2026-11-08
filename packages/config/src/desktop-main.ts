const DEFAULT_DESKTOP_API_URL = "http://localhost:3000";

export interface DesktopMainEnv {
  readonly DESKTOP_API_URL: string;
}

export interface DesktopMainEnvOptions {
  readonly embeddedApiUrl?: string;
  readonly isPackaged: boolean;
}

function configuredDesktopApiUrl(
  environment: Readonly<Record<string, string | undefined>>,
  options: DesktopMainEnvOptions,
): string {
  const runtimeOverride = environment.DESKTOP_API_URL?.trim();
  const embeddedApiUrl = options.embeddedApiUrl?.trim();
  const value =
    runtimeOverride || embeddedApiUrl || (options.isPackaged ? undefined : DEFAULT_DESKTOP_API_URL);
  if (!value) {
    throw new Error("DESKTOP_API_URL is required for packaged desktop applications");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DESKTOP_API_URL must be a valid URL");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new Error("DESKTOP_API_URL must not include credentials, a query, or a fragment");
  }
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && !options.isPackaged && loopback.has(parsed.hostname))
  ) {
    throw new Error(
      options.isPackaged
        ? "DESKTOP_API_URL must use HTTPS in packaged desktop applications"
        : "DESKTOP_API_URL must be HTTPS or a loopback development origin",
    );
  }
  return parsed.origin;
}

export function resolveDesktopMainEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: DesktopMainEnvOptions = { isPackaged: false },
): DesktopMainEnv {
  return Object.freeze({ DESKTOP_API_URL: configuredDesktopApiUrl(environment, options) });
}

/** Public Convex origin used by the privileged desktop allowlist and renderer together. */
export function resolveDesktopConvexUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error("VITE_CONVEX_URL is required for desktop Convex mode");
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("VITE_CONVEX_URL must be a valid HTTPS origin");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new Error(
      "VITE_CONVEX_URL must be an HTTPS origin without credentials, paths, queries, or fragments",
    );
  }
  return parsed.origin;
}
