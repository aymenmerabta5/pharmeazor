# Docker production contract

The image build requires BuildKit and never copies `.env*` into a layer. Runtime
secrets are injected separately through Compose `env_file`. Replace every
required `REPLACE_WITH_*` value before building; schema validation
intentionally fails closed for selected providers such as Redis.

The application artifacts are built before the image, not inside it. The agent
sandbox prepares its template against the Docker daemon, and the daemon binds
the project path of the machine that runs the build, so the build has to run
where the daemon can reach it. The image then assembles the artifacts it
produced and installs the production dependency graph.

The build also requires a regular root `bun.lock`. If this project was created
with `--no-install`, run `bun run install:bootstrap` using Bun `1.4.4` before
building. The Dockerfile checks this before its frozen install and rejects a
missing lock, directory, or symbolic link with corrective guidance.
Both container installs read the generated `bunfig.toml`, enforcing a
604800-second minimum package age with no exclusions.

## Compose (recommended)

```bash
bun --env-file=.env.local scripts/build-deployment.mjs
docker compose --env-file .env.local -f compose.production.yml up -d --build
docker compose -f compose.production.yml ps
```

The application service sets `stop_grace_period: 30s` and inherits the image health check at `/api/health`.

The Compose file mounts the stable named volume `pharmeazor_eve_workflow_data` at `/app/apps/eve/.eve/.workflow-data`. `docker compose down` preserves it; never use `down -v` unless deleting Workflow state is intentional.

This profile uses process-local admission or Workflow state. Run exactly one application replica until a shared transactional adapter is configured.

## Database

The application expects PostgreSQL 18.7 with the pgvector 0.8.7 extension. The
production Compose file does not run a database; point `DATABASE_URL` at a
managed instance that already has the extension, or at a container built from
`docker/postgres/Dockerfile`.

The development database is started with:

```bash
docker compose --env-file .env.local up -d
```

Compose builds the pgvector image on first run and mounts
`docker/postgres/init` so a fresh database registers the extension
automatically. For a database that already exists, run
`bun run db:ensure-extensions` once; it is idempotent.

`docker-compose.yml` and `start-database.sh` are generator-owned and are
rewritten by `ghostinit sync`. `docker-compose.override.yml` repeats the
pgvector service fields so they survive that regeneration. Do not run
`docker compose -f docker-compose.yml` without the override file.

## Continuous integration environment

The server environment schema fails closed for Redis and for the other
providers that must be reachable at runtime, so a build cannot run against the
placeholder values in `.env.example`. CI generates a throwaway `.env.local`
with non-secret placeholders instead:

```bash
bun scripts/prepare-ci-env.mjs
```

That file is never committed. To verify a database against the same contract
the pipeline uses, run `bun run db:verify`, which asserts the server version,
the registered `vector` extension, the `halfvec` type, and a real vector
distance computation.

## Standalone Docker

The application is built before the image, because the agent sandbox prepares
its template against the Docker daemon and the daemon binds the project path
of the machine that runs the build. These commands work from PowerShell, cmd,
bash, and zsh (enter the `docker run` command on one line where shell
continuation differs):

```bash
bun --env-file=.env.local scripts/build-deployment.mjs
docker build -t pharmeazor .
docker run -d --name pharmeazor --env-file .env.local -p 127.0.0.1:3000:3000 \
  --mount type=volume,src=pharmeazor_eve_workflow_data,dst=/app/apps/eve/.eve/.workflow-data \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --group-add "$(stat -c %g /var/run/docker.sock)" pharmeazor
docker inspect --format "{{json .State.Health}}" pharmeazor
docker stop --time 30 pharmeazor
```

`STOPSIGNAL SIGTERM` selects the signal but does not extend Docker's default
10-second timeout. Always retain the Compose grace period or use
`docker stop --time 30` for standalone containers.

## Agent sandbox

The agent runs its tools in a Docker container that carries a Python runtime,
so the host needs a reachable Docker daemon.

- The application is built before the image, because the agent sandbox
  prepares its template against the Docker daemon and the daemon binds the
  project path of the machine that runs the build. Build the application and
  the image on the machine that runs the container, so both reach the same
  daemon.
- The runtime creates the sandbox container on the same daemon, so the running
  container needs the same socket and a process that may use it. The image
  runs as uid 1000, so add the group that owns the host socket with
  `--group-add`.
- The prepared template image lives on the daemon that built it. Keep that
  image on the host, and run every replica against the same daemon.
- The socket grants control of the daemon, which is a root-equivalent
  privilege on the host. Keep the daemon on a dedicated machine.

See `docs/EVE_SELF_HOSTING.md` for the full contract and
`apps/eve/agent/sandbox/README.md` for the runtime the container provides.
