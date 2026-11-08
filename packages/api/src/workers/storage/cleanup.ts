import "server-only";

import { runPostgresStorageCleanupBatch } from "../../adapters/storage/postgres";

const CLEANUP_BATCH_LIMIT = 100;
const CLEANUP_POLL_MS = 60_000;
const STORAGE_CLEANUP_WORKER_ENTRY = "--ghostinit-storage-cleanup-worker";

async function stageExpiredMessagingAttachments(_now: Date): Promise<number> {
  return 0;
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

export async function runPostgresStorageCleanupCycle() {
  const now = new Date();
  const expiredAttachments = await stageExpiredMessagingAttachments(now);
  const blobs = await runPostgresStorageCleanupBatch({ limit: CLEANUP_BATCH_LIMIT });
  return { expiredAttachments, ...blobs };
}

export async function runPostgresStorageCleanupWorker(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const result = await runPostgresStorageCleanupCycle();
      if (result.expiredAttachments > 0 || result.reservationsReleased > 0 || result.claimed > 0) {
        console.info(JSON.stringify({ scope: "storage-cleanup", event: "batch", ...result }));
      }
    } catch {
      console.error(JSON.stringify({ scope: "storage-cleanup", event: "batch-failed" }));
    }
    await sleep(CLEANUP_POLL_MS, signal);
  }
}

function isDirectExecution(): boolean {
  return process.argv.includes(STORAGE_CLEANUP_WORKER_ENTRY);
}

if (isDirectExecution()) {
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());
  await runPostgresStorageCleanupWorker(shutdown.signal);
}
