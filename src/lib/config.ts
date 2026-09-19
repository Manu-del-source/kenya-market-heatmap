/**
 * Server-only configuration.
 *
 * Every environment variable the platform understands is declared here so the
 * surface stays small and auditable. Nothing in this file may be imported from
 * a client component — secrets must never reach the browser.
 */

export type ProviderId = "demo" | "nse";

export const MARKET_TIMEZONE = "Africa/Nairobi";

/** NSE equities trading window (East Africa Time). Used for polling + labels. */
export const MARKET_SESSION = {
  openHour: 9,
  openMinute: 0,
  closeHour: 15,
  closeMinute: 0,
  /** Monday–Friday. */
  tradingDays: [1, 2, 3, 4, 5],
} as const;

function readString(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInt(name: string, fallback: number): number {
  const raw = readString(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = readString(name);
  if (!raw) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

function readProviderId(name: string): ProviderId | "auto" {
  const raw = readString(name)?.toLowerCase();
  if (raw === "demo" || raw === "mock" || raw === "sample") return "demo";
  if (raw === "nse" || raw === "nse-licensed" || raw === "licensed") return "nse";
  return "auto";
}

export const config = {
  /** Which market-data provider to use. `auto` prefers a licensed feed when configured. */
  marketDataProvider: readProviderId("MARKET_DATA_PROVIDER"),

  /** Postgres connection string. When absent the read-only file repository is used. */
  databaseUrl: readString("DATABASE_URL"),

  /** Licensed NSE market data feed (see docs/market-data.md). */
  nse: {
    baseUrl: readString("NSE_MARKET_API_BASE_URL"),
    apiKey: readString("NSE_MARKET_API_KEY"),
    /** Vendor name used for attribution, e.g. "SIX Financial Information". */
    vendor: readString("NSE_MARKET_API_VENDOR"),
    /** Feed licence class, e.g. "delayed-15m" | "end-of-day" | "live". */
    feed: readString("NSE_MARKET_API_FEED") ?? "delayed-15m",
    /** HTTP timeout in ms. */
    timeoutMs: readInt("NSE_MARKET_API_TIMEOUT_MS", 10_000),
  },

  cache: {
    /** TTL for server-side market reads, in seconds. */
    marketTtlSeconds: readInt("MARKET_DATA_CACHE_TTL_SECONDS", 60),
    /** TTL for long historical series, in seconds. */
    historyTtlSeconds: readInt("MARKET_HISTORY_CACHE_TTL_SECONDS", 900),
    /** In-process cache ceiling; protects memory on long-lived servers. */
    maxEntries: readInt("MARKET_CACHE_MAX_ENTRIES", 500),
  },

  api: {
    /** Requests per window allowed per client for read endpoints. */
    rateLimitPerMinute: readInt("API_RATE_LIMIT_PER_MINUTE", 120),
    /** Hard cap on rows returned by list endpoints. */
    maxPageSize: readInt("API_MAX_PAGE_SIZE", 100),
    defaultPageSize: readInt("API_DEFAULT_PAGE_SIZE", 25),
  },

  site: {
    /** Absolute origin used for canonical URLs and sitemaps. */
    url:
      readString("NEXT_PUBLIC_SITE_URL") ??
      (readString("VERCEL_URL") ? `https://${readString("VERCEL_URL")}` : undefined) ??
      "http://localhost:3000",
    name: "Kenya Market Intelligence",
  },

  /** Set to true to make every API response advertise `no-store`. Useful in demos. */
  disableCache: readBoolean("MARKET_DATA_DISABLE_CACHE", false),
} as const;

/**
 * True when a licensed NSE feed is fully configured and may be used.
 *
 * The platform deliberately falls back to the clearly-labelled demo provider
 * rather than half-configuring a live feed.
 */
export function isLicensedFeedConfigured(): boolean {
  return Boolean(config.nse.baseUrl && config.nse.apiKey);
}

/** Resolve the configured provider, applying the `auto` rule. */
export function resolveProviderId(): ProviderId {
  if (config.marketDataProvider !== "auto") return config.marketDataProvider;
  return isLicensedFeedConfigured() ? "nse" : "demo";
}
