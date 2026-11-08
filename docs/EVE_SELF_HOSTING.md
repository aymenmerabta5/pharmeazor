# Eve self-hosting contract

The generated Next.js application uses `withEve` for routing and the production supervisor owns one private loopback Eve process.

## Build and process ownership

- `bun run dev` supervises Next.js and its private Eve companion together. TanStack Start runs `bun run eve:dev` separately.
- Eve runs on Node.js 24.19.0 in development and production; the web app keeps its selected execution runtime. Next receives the development companion's loopback origin through `EVE_BASE_URL` and does not start a second Eve process.
- `bun run build` builds Eve before Next.js. On Vercel, Next/`withEve` owns the generated service build.
- `bun run start` loads the local root environment and delegates to the hardened production supervisor. Injected production environments use `bun run start:production` directly when no `.env.local` exists.
- The supervisor starts exactly one web process and one loopback Eve process, validates distinct ports, waits for both listeners, and propagates failure and shutdown to both trees.
- `bun run eve:dev` and `bun run eve:start` remain explicit diagnostics. Do not run them beside the supervised production lifecycle.
- The Eve application root is `apps/eve`.

## Durable workflow state

Self-hosted Eve stores local Workflow state under `apps/eve/.eve/.workflow-data`. That directory must be persistent before accepting traffic. The generated `compose.production.yml` and Fly target mount stable named volumes, but those volumes are machine-local. The bare Dockerfile intentionally does not declare an anonymous volume; follow `docs/DOCKER_DEPLOYMENT.md` so standalone replacement containers reuse the explicit named volume. Fly keeps one application machine warm so authored schedules can fire even without HTTP traffic. Run one Eve/web replica or configure a Workflow world backed by shared durable storage before scaling horizontally. Never bake an existing `.eve` directory into an image.

## Reverse proxy and separate-service deployments

The integrated process exposes browser traffic through the Next.js origin. If Eve is moved behind a separate origin, set `EVE_NEXT_PRODUCTION_ORIGIN` during the Next.js build and preserve both route families at the Eve ingress without rewriting them:

- `/eve/` for health, sessions, streams, tools, channels, and subagents
- `/.well-known/workflow/` for Workflow callbacks

Set `AI_GATEWAY_API_KEY` on non-Vercel hosts when the agent uses a string model ID. Replace the generated placeholder through the host secret manager.
