# Billing providers - modular <300

See interface.ts port contract. Each provider is split into services:

- stripe/: client, mappers, checkout, customer, portal, webhook, subscriptions, cancel + barrel stripe.ts
- chargily/: client, product, payment-link, customer, checkout, operations, webhook, subscriptions

All webhooks use Buffer.from(await req.arrayBuffer()) NOT req.json().

The manual rail has no provider adapter. It settles by bank transfer and
administrator approval, so it never reaches a hosted checkout. It writes to the
same subscription row as the two rails above, through the shared subscription
lifecycle in @repo/services/billing.
