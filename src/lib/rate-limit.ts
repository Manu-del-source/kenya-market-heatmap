/**
 * Fixed-window rate limiter for API routes.
 *
 * In-memory and therefore per-instance: it protects a single serverless lambda
 * from accidental self-inflicted load (a polling client, a loop, a scraper) but
 * it is not a substitute for an edge/WAF limit. For production, front the
 * public API with Vercel Firewall rules or a shared store (Upstash/Redis) —
 * swap `checkRateLimit` and the interface stays the same.
 */

import { config } from "./config";

type Window = {
  count: number;
  resetAt: number;
};

const windows = new Map<string, Window>();

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** UNIX seconds at which the window resets. */
  resetAt: number;
  retryAfterSeconds: number;
};

/** Best-effort client identity from proxy headers. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export function checkRateLimit(
  key: string,
  limit = config.api.rateLimitPerMinute,
  windowMs = 60_000
): RateLimitResult {
  const timestamp = Date.now();
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= timestamp) {
    windows.set(key, { count: 1, resetAt: timestamp + windowMs });
    if (windows.size > 10_000) {
      for (const [entry, value] of windows) {
        if (value.resetAt <= timestamp) windows.delete(entry);
      }
    }
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: Math.ceil((timestamp + windowMs) / 1000),
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: Math.ceil(existing.resetAt / 1000),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - timestamp) / 1000),
  };
}

/** Standard `RateLimit-*` / `Retry-After` headers for a throttled response. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetAt),
  };
  if (!result.allowed) headers["Retry-After"] = String(result.retryAfterSeconds);
  return headers;
}
