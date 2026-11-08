# Analytics ingest proxy

- Client posthog-js configured with api_host: "/api/ingest"
- Next.js or TanStack Start route handler /api/ingest/* proxies to the allowlisted PostHog host
- SSRF protection: only allowlisted hosts accepted

Allowlist: us.i.posthog.com, eu.i.posthog.com, app.posthog.com, us-assets, eu-assets
