# Docker production contract

The image build requires BuildKit and mounts `.env.local` as the ephemeral
`ghostinit_env` build secret. The Dockerfile never copies `.env*` into a
layer. Runtime secrets are injected separately through Compose `env_file`.
Replace every required `REPLACE_WITH_*` value before building; schema
validation intentionally fails closed for selected providers such as Redis.

The build also requires a regular root `bun.lock`. If this project was created
with `--no-install`, run `bun run install:bootstrap` using Bun `1.4.4` before
building. The Dockerfile checks this before its frozen install and rejects a
missing lock, directory, or symbolic link with corrective guidance.
Both container installs read the generated `bunfig.toml`, enforcing a
604800-second minimum package age with no exclusions.

## Compose (recommended)

```bash
docker compose --env-file .env.local -f compose.production.yml up -d --build
docker compose -f compose.production.yml ps
```

The application service sets `stop_grace_period: 30s` and inherits the image health check at `/api/health`.

The Compose file mounts the stable named volume `pharmeazor_eve_workflow_data` at `/app/apps/eve/.eve/.workflow-data`. `docker compose down` preserves it; never use `down -v` unless deleting Workflow state is intentional.

This profile uses process-local admission or Workflow state. Run exactly one application replica until a shared transactional adapter is configured.

## Standalone Docker

These commands work from PowerShell, cmd, bash, and zsh (enter the `docker run` command on one line where shell continuation differs):

```bash
docker build --secret id=ghostinit_env,src=.env.local -t pharmeazor .
docker run -d --name pharmeazor --env-file .env.local -p 127.0.0.1:3000:3000 \
  --mount type=volume,src=pharmeazor_eve_workflow_data,dst=/app/apps/eve/.eve/.workflow-data pharmeazor
docker inspect --format "{{json .State.Health}}" pharmeazor
docker stop --time 30 pharmeazor
```

`STOPSIGNAL SIGTERM` selects the signal but does not extend Docker's default
10-second timeout. Always retain the Compose grace period or use
`docker stop --time 30` for standalone containers.
