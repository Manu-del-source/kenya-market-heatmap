/**
 * Small in-process TTL cache used by the service layer.
 *
 * Why not `unstable_cache` / `use cache`? Those require Cache Components and
 * couple the read path to the Next.js cache handler. Market reads are also
 * consumed from Route Handlers, Server Components and ingestion scripts, so a
 * plain TTL map keeps one code path everywhere. It is per-instance: on Vercel
 * each lambda warms its own copy, which is acceptable for data that changes at
 * most once per minute.
 */

import { config } from "./config";

type Entry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function now() {
  return Date.now();
}

function prune() {
  if (store.size <= config.cache.maxEntries) return;
  // Cheap eviction: drop whatever is already expired, then oldest inserted.
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now()) store.delete(key);
  }
  const overflow = store.size - config.cache.maxEntries;
  if (overflow <= 0) return;
  let removed = 0;
  for (const key of store.keys()) {
    store.delete(key);
    if (++removed >= overflow) break;
  }
}

/**
 * Run `loader` through the cache. Concurrent callers for the same key share a
 * single in-flight promise so a cold lambda does not stampede the provider.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  if (config.disableCache || ttlSeconds <= 0) return loader();

  const hit = store.get(key);
  if (hit && hit.expiresAt > now()) return hit.value as T;
  if (hit) store.delete(key);

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: now() + ttlSeconds * 1000 });
      prune();
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

/** Drop a single key (or every key sharing a prefix). Used after ingestion. */
export function invalidate(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

export function clearCache() {
  store.clear();
  inflight.clear();
}
