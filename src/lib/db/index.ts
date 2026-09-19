/**
 * Storage entry point.
 *
 *   DATABASE_URL set  → PostgresRepository (durable)
 *   otherwise         → MemoryRepository   (process-local, non-durable)
 *
 * The Postgres implementation is imported dynamically so deployments without a
 * database never load the driver and never open a connection.
 */

import { config } from "@/lib/config";
import { MemoryRepository } from "./repositories/memory-repository";
import type { MarketRepository } from "./repository";

let instance: MarketRepository | null = null;
let pending: Promise<MarketRepository> | null = null;

export async function getRepository(): Promise<MarketRepository> {
  if (instance) return instance;
  if (pending) return pending;

  pending = (async () => {
    if (config.databaseUrl) {
      const { PostgresRepository } = await import("./repositories/postgres-repository");
      instance = new PostgresRepository();
      return instance;
    }
    instance = new MemoryRepository();
    return instance;
  })();

  return pending;
}

/** Test helper: drop the memoised repository. */
export function resetRepository() {
  instance = null;
  pending = null;
}

export type { MarketRepository };
