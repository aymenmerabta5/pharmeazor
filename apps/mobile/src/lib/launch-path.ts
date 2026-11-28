/**
 * The path a launch URL asked for, without a query string or fragment.
 *
 * A custom scheme puts the first segment in the URL host
 * (`pharmeazor://auth/reset-password`), so the host is joined back the way the
 * router reads it. A web URL keeps only its path.
 */
export function launchPathname(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = /^https?:$/.test(parsed.protocol)
      ? parsed.pathname
      : `${parsed.host}${parsed.pathname}`;
    const trimmed = path.replace(/\/+$/, "");
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  } catch {
    return null;
  }
}
