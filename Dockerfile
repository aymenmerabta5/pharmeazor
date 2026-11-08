# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS bun-runtime

FROM node:24.19.0-bookworm-slim AS base
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

# Stable Dockerfile syntax deliberately copies the complete workspace before
# installation. This preserves workspace paths and makes Bun read bunfig.toml
# without relying on experimental parent-preserving copy flags.
COPY . .
RUN bun scripts/require-bun-lock.mjs
RUN bun run audit:lock
RUN bun install --frozen-lockfile

RUN --mount=type=secret,id=ghostinit_env,required=false \
    --mount=type=secret,id=ghostinit_env_b64,required=false \
    set -eu; \
    build_env=/tmp/ghostinit-build.env; \
    trap 'rm -f "$build_env"' EXIT; \
    if [ -s /run/secrets/ghostinit_env ]; then \
      bun --env-file=/run/secrets/ghostinit_env scripts/build-deployment.mjs; \
    elif [ -s /run/secrets/ghostinit_env_b64 ]; then \
      bun -e 'await Bun.write(process.argv[1], Buffer.from(await Bun.file(process.argv[2]).text(), "base64"))' "$build_env" /run/secrets/ghostinit_env_b64; \
      bun --env-file="$build_env" scripts/build-deployment.mjs; \
    else \
      echo "Build secret ghostinit_env (or ghostinit_env_b64 on Fly) is required" >&2; \
      exit 1; \
    fi
# The build install contains every workspace so Turbo can compile the selected graph.
# Recreate node_modules from the frozen production graph: Bun does not remove
# already-installed dev or excluded-workspace packages when --production is rerun.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules tooling/*/node_modules
# Husky is a root development prepare hook. Remove only that hook so Bun can
# still run trusted production dependency lifecycle scripts during the reinstall.
RUN bun pm pkg delete scripts.prepare
RUN bun run audit:lock
RUN bun install --production --frozen-lockfile --filter='./' --filter='web...' --filter='@repo/api...' --filter='pharmeazor-eve...'
RUN bun scripts/assert-web-runtime-boundary.mjs
# Native clients are separate deliverables and never belong in the web runtime image.
RUN rm -rf apps/mobile


FROM node:24.19.0-bookworm-slim
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
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
