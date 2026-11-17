---
cron: "0 * * * *"
---

Run ghostinit sync --check in parent GhostInit project root and report drift.
Steps: 1. From project root run ghostinit sync --check --json 2. If drift detected notify and suggest ghostinit sync --json 3. List drift details.
Use tools: sync_registries with check true.
Hourly 0 * * * * UTC.
