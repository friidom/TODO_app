import type { CacheStore } from "../cache/cache.js";

export class MemoryCacheStore implements CacheStore {
  readonly entries = new Map<string, { value: string; ttlSeconds: number }>();

  isReady(): boolean {
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.entries.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, ttlSeconds });
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }
}

// Answers the way node-redis does once Redis has gone away and the offline
// queue is disabled: every command is rejected at once.
function offline(): Promise<never> {
  return Promise.reject(new Error("The client is offline"));
}

export const unavailableStore: CacheStore = {
  isReady: () => false,
  get: offline,
  set: offline,
  del: offline,
};
