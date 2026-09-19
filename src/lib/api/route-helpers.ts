/**
 * Shared Route Handler plumbing: envelopes, errors, caching and rate limiting.
 *
 * Every public endpoint returns the same shape:
 *
 *   { "meta": { provider, dataMode, asOf, attribution, limitations }, "data": ... }
 *   { "error": { code, message }, "meta": {...} }
 *
 * Keeping provenance inside the body (not just HTTP headers) means a consumer
 * that saves a response can always tell what it is looking at later.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { MarketDataMeta } from "@/lib/types/market";
import { config } from "@/lib/config";
import { checkRateLimit, clientKey, rateLimitHeaders } from "@/lib/rate-limit";
import { isPublicError } from "@/lib/providers/errors";

/** How long a CDN may reuse a successful market read, in seconds. */
const DEFAULT_S_MAXAGE = 60;

export type ApiEnvelope<T> = {
  meta: MarketDataMeta;
  data: T;
};

export type ApiError = {
  error: { code: string; message: string };
  meta: Pick<MarketDataMeta, "provider" | "dataMode" | "asOf"> | null;
};

export function jsonEnvelope<T>(
  data: T,
  meta: MarketDataMeta,
  init?: { status?: number; sMaxAge?: number }
) {
  const sMaxAge = init?.sMaxAge ?? DEFAULT_S_MAXAGE;
  return NextResponse.json<ApiEnvelope<T>>(
    { meta, data },
    {
      status: init?.status ?? 200,
      headers: {
        // CDN cache + browser revalidation. `must-revalidate` keeps stale
        // figures from lingering once the window expires.
        "Cache-Control": config.disableCache
          ? "no-store"
          : `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 5}, must-revalidate`,
      },
    }
  );
}

export function errorResponse(
  error: unknown,
  fallbackMessage = "Request could not be completed.",
  meta: Pick<MarketDataMeta, "provider" | "dataMode" | "asOf"> | null = null
) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;

  const message =
    isPublicError(error) && error instanceof Error
      ? error.message
      : status < 500
        ? error instanceof Error
          ? error.message
          : fallbackMessage
        : fallbackMessage;

  if (status >= 500 && error instanceof Error) {
    // Log server-side, return a generic message: never leak internals.
    console.error("[api] request failed:", error);
  }

  return NextResponse.json<ApiError>(
    {
      error: {
        code: status === 404 ? "not_found" : status === 400 ? "bad_request" : status === 429 ? "rate_limited" : "upstream_error",
        message,
      },
      meta,
    },
    { status: Number.isFinite(status) ? status : 500, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Wrap a Route Handler with rate limiting + error normalisation.
 *
 * Expensive endpoints (history, breadth) can pass a lower `limit`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteContext = { params: Promise<Record<string, string>> } | any;

export function withApi(
  handler: (request: NextRequest, context: RouteContext) => Promise<Response>,
  options: { limit?: number } = {}
) {
  return async function route(request: NextRequest, context: RouteContext): Promise<Response> {
    const limitResult = checkRateLimit(clientKey(request), options.limit);
    if (!limitResult.allowed) {
      const response = NextResponse.json<ApiError>(
        {
          error: { code: "rate_limited", message: "Too many requests. Please slow down." },
          meta: null,
        },
        { status: 429, headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limitResult) } }
      );
      return response;
    }

    try {
      const response = await handler(request, context);
      for (const [key, value] of Object.entries(rateLimitHeaders(limitResult))) {
        response.headers.set(key, value);
      }
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Constant-time-ish comparison for the cron secret. */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
