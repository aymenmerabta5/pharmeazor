import type { NextConfig } from "next";
import { withEve, type WithEveConfigFunction } from "eve/next";
import createNextIntlPlugin from "next-intl/plugin";

const config: NextConfig = {
  // Cache Components keeps static shells and Partial Prerendering available.
  // On self-hosted horizontal replicas, configure and verify the appropriate
  // Next.js cacheHandler/cacheHandlers against shared storage. --cache redis
  // configures the application cache only; it does not configure Next.js.
  cacheComponents: true,
  experimental: {
    webpackBuildWorker: true,
    // Limit local prerender worker copies; CI keeps Next's default parallelism.
    ...(process.env.CI ? {} : { cpus: 2 }),
    // Reclaim persisted compiler cache between local development snapshots.
    turbopackMemoryEviction:
      process.env.NODE_ENV === "development" && !process.env.CI ? "full" : "auto",
  },
  // Native SDK loading avoids compiling large provider graphs on unrelated routes.
  serverExternalPackages: ["stripe", "@chargily/chargily-pay"],
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    // Next.js and the locale bootstrap emit inline hydration scripts. A
    // per-request nonce would force every route to be dynamic and would disable
    // Cache Components/PPR, so unsafe-inline remains until a production-ready
    // static hash/SRI path is available. React needs unsafe-eval only in dev.
    // Test runners can launch the development server with NODE_ENV=test, so
    // treat that explicit non-production mode as development diagnostics too.
    const allowsDevelopmentDiagnostics =
      process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    const convexConnectSources = "";

    const contentSecurityPolicy =
      "default-src 'self'; script-src 'self' 'unsafe-inline'" +
      (allowsDevelopmentDiagnostics ? " 'unsafe-eval'" : "") +
      "; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://us.i.posthog.com" +
      convexConnectSources +
      "; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';";
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-XSS-Protection",
            value: "0",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            // preload omitted by default — see securityHeaders comment
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [],
  },
  outputFileTracingIncludes: {
    "/api/pdf": [
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif.ttf",
      "./node_modules/dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf",
    ],
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
      {
        source: "/ingest/decide",
        destination: "https://us.i.posthog.com/decide",
      },
    ];
  },
  transpilePackages: [
    "@repo/analytics",
    "@repo/api",
    "@repo/auth",
    "@repo/billing",
    "@repo/config",
    "@repo/contracts",
    "@repo/database",
    "@repo/email",
    "@repo/kernel",
    "@repo/modules",
    "@repo/observability",
    "@repo/services",
    "@repo/ui",
  ],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withEveConfig = withEve(withNextIntl(config), {
  eveRoot: "../eve",
});

// Eve returns a Next config function, so resolve it before normalizing fields.
const nextConfig: WithEveConfigFunction<NextConfig> = async (phase, context) => {
  const resolved = await withEveConfig(phase, context);
  const experimental = resolved.experimental;
  if (!experimental || !Reflect.has(experimental, "turbo")) return resolved;
  const normalizedExperimental = { ...experimental };
  Reflect.deleteProperty(normalizedExperimental, "turbo");
  return { ...resolved, experimental: normalizedExperimental };
};

export default nextConfig;
