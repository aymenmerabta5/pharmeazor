# Billing webhooks — raw body pattern

All 4 need Buffer.from(await req.arrayBuffer()) NOT req.json() else 403.
Idempotent via webhook_events unique(provider+providerEventId).
Framework-aware: Next.js emits app/api/webhooks/_/route.ts, TanStack Start emits routes/api/webhooks/_.ts with createFileRoute server.handlers.
Convex: public routes call api.billingServer.mutate; that trusted action delegates to internal.billing.* with leased composite idempotency [provider, providerEventId].
