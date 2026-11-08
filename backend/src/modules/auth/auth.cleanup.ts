import { pruneDeadAuthRows } from "./auth.repo.js";

const DAY = 86_400_000;
const RETENTION_DAYS = 30;

async function prune(): Promise<void> {
  try {
    const removed = await pruneDeadAuthRows(new Date(Date.now() - RETENTION_DAYS * DAY));

    if (removed > 0) console.log(`[cleanup] removed ${removed} dead sessions and spent tokens`);
  } catch (error) {
    console.error("[cleanup] failed", error);
  }
}

// In-process rather than cron: one API instance, and a missed day costs nothing.
export function scheduleAuthCleanup(): void {
  setTimeout(() => void prune(), 60_000).unref();
  setInterval(() => void prune(), DAY).unref();
}
