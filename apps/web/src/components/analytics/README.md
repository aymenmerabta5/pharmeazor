# Analytics components

- posthog-provider.tsx — PostHogProvider wrapping app, bootstraps flags via SSR.
- posthog-pageview.tsx — captures $pageview on pathname/search changes.
- Feature flag gates, experiment gates, toolbar debug, consent banner.

Usage monorepo:

```tsx
import { PostHogProvider } from "@repo/analytics/client";
import { PostHogPageView } from "@repo/analytics/client";

<PostHogProvider bootstrapFlags={flags} distinctId={userId}>
  <PostHogPageView />
  {children}
</PostHogProvider>;
```

Proxy: Client sends to /api/ingest, which proxies to PostHog with SSRF allowlist.
