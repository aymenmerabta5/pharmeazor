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

## Agent sandbox

The agent runs its shell and file tools in a Docker container that carries a Python runtime, so it can extract PDFs, Word documents, and spreadsheets. `apps/eve/agent/sandbox/Dockerfile` defines that image and `apps/eve/agent/sandbox/README.md` documents the contract.

- The host needs a reachable Linux Docker daemon while `eve build` prepares the sandbox template and while a session opens its container.
- The build and the runtime must reach the same daemon, because the prepared template image lives on that daemon. A replica on another host starts a fresh sandbox or fails with `SandboxTemplateNotProvisionedError`.
- The application image ships the Docker CLI and the production image build reaches the daemon through `DOCKER_HOST`, because BuildKit resolves the source of a bind mount against the build context and cannot mount a host socket. Publish the daemon with `node scripts/docker-tcp-proxy.mjs` and build with `--network=host --build-arg DOCKER_HOST=tcp://127.0.0.1:2375`. `compose.production.yml` mounts the host socket at runtime and adds the host docker group through `DOCKER_GID`.
- Mounting the Docker socket gives the service control of that daemon, which is a root-equivalent privilege on the host. Run the daemon on a dedicated machine, or use a provider every replica can reach instead.
- Vercel deployments use Vercel Sandbox instead, and the hosted runtime installs the same pinned Python packages while it prepares its snapshot.

## Reverse proxy and separate-service deployments

The integrated process exposes browser traffic through the Next.js origin. If Eve is moved behind a separate origin, set `EVE_NEXT_PRODUCTION_ORIGIN` during the Next.js build and preserve both route families at the Eve ingress without rewriting them:

- `/eve/` for health, sessions, streams, tools, channels, and subagents
- `/.well-known/workflow/` for Workflow callbacks

Set the model provider credential on non-Vercel hosts: `GROQ_API_KEY` for the generated `openai/gpt-oss-120b` model, or `AI_GATEWAY_API_KEY` when the agent uses an AI Gateway string model ID. Replace the generated placeholders through the host secret manager. `bun run dev` loads the repository-root `.env.local` with `--env-file`; workspace scripts that start Eve directly must do the same.
