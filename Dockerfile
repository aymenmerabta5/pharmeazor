# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS bun-runtime

# The agent runs its sandbox in a sibling container, so the image needs the
# Docker CLI. The official CLI image ships a statically linked binary that
# runs on this Debian-based runtime.
FROM docker:29.9.3-cli AS docker-cli

FROM node:24.19.0-bookworm-slim AS base
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app

# Stable Dockerfile syntax deliberately copies the complete workspace before
# installation. This preserves workspace paths and makes Bun read bunfig.toml
# without relying on experimental parent-preserving copy flags.
COPY . .
RUN bun scripts/require-bun-lock.mjs
RUN bun run audit:lock
# The application artifacts are built outside the image. The agent sandbox
# prepares its template against the Docker daemon, and the daemon binds the
# project path of the machine that runs the build, so a build inside the image
# can never reach the daemon's view of the project.
RUN test -f apps/web/.next/BUILD_ID || { \
      echo "The web application was not built." >&2; \
      echo "Run 'bun --env-file=.env.local scripts/build-deployment.mjs' before building the image." >&2; \
      exit 1; \
    }; \
    test -f apps/eve/.output/server/index.mjs || { \
      echo "The Eve agent was not built." >&2; \
      echo "Run 'bun --env-file=.env.local scripts/build-deployment.mjs' before building the image." >&2; \
      exit 1; \
    }
# Husky is a root development prepare hook. Remove only that hook so Bun can
# still run trusted production dependency lifecycle scripts during the install.
RUN bun pm pkg delete scripts.prepare
# Peer packages are not part of the runtime graph. The shared auth server
# registers the Better Auth Expo plugin so the mobile client can authenticate
# against the deployed API, and that plugin declares the Expo client runtime as
# optional peers. Installing peers would pull the whole Expo and React Native
# toolchain into the web runtime image, so the pruned install omits them.
RUN bun install --production --frozen-lockfile --omit=peer \
    --filter='./' --filter='web...' --filter='@repo/api...' --filter='pharmeazor-eve...'
RUN bun scripts/assert-web-runtime-boundary.mjs
# Native clients are separate deliverables and never belong in the web runtime image.
RUN rm -rf apps/mobile


FROM node:24.19.0-bookworm-slim
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
STOPSIGNAL SIGTERM
# STOPSIGNAL selects SIGTERM only; it does not extend Docker's 10-second default.
# compose.production.yml grants 30s. For standalone containers use:
# docker stop --time 30 <container>
# Container-local uploads are not durable or shared. Use S3/Tigris by default;
# configure STORAGE_BUCKET and credentials as runtime secrets. Override only
# when an explicitly managed single-instance volume is mounted.
# Storage-enabled profiles supervise their cleanup worker in this image.
ENV STORAGE_DRIVER=s3
COPY --from=base --chown=1000:1000 /app ./
# PDF admission is process-local. Run exactly one web replica unless you replace it with a shared transactional adapter.
RUN mkdir -p /app/apps/web/.next/cache /app/apps/web/.next/server/app /app/apps/web/.next/server/pages /app/data/uploads /app/apps/eve/.eve /app/apps/eve/.eve/.workflow-data && chown -R 1000:1000 /app/apps/web/.next/cache /app/apps/web/.next/server/app /app/apps/web/.next/server/pages /app/data/uploads /app/apps/eve/.eve /app/apps/eve/.eve/.workflow-data
ENV EVE_NEXT_PRODUCTION_PORT=4274
ENV UPLOADS_DIR=/app/data/uploads
USER 1000:1000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:3000/api/health'); if (!response.ok) process.exit(1)"]
CMD ["bun", "scripts/start-production.mjs"]
