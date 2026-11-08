# Billing providers - modular <300

See interface.ts port contract. Each provider now split into services:

- stripe/: client, mappers, checkout, customer, portal, webhook, subscriptions + barrel stripe.ts
- chargily/: client, product, payment-link, customer, checkout, operations, webhook, subscriptions
- paddle/: client, mappers, checkout, customer, portal, webhook, subscriptions
- polar/: types, sdk-loader, mappers, client, checkout, customer, portal, webhook, subscriptions, license, usage, constants
  All webhooks Buffer.from(await req.arrayBuffer()) NOT req.json()
