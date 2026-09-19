/**
 * Licensed NSE market-data provider.
 *
 * IMPORTANT
 * ---------
 * The Nairobi Securities Exchange does not publish a free, open market-data
 * API. Real-time, delayed and end-of-day NSE data is licensed: you obtain it
 * either directly from NSE Data Services or through an authorised information
 * vendor (SIX Financial Information, S&P Global, ICE, Synergy Systems and
 * others). Redistribution, derived-data creation and even display are governed
 * by the NSE Market Data Policy.
 *
 * This class therefore does NOT contain a scraper and does NOT know a public
 * endpoint. It implements a documented, vendor-neutral HTTP contract that a
 * licensed feed must satisfy, and it refuses to run unless:
 *
 *   NSE_MARKET_API_BASE_URL  and  NSE_MARKET_API_KEY
 *
 * are configured. See docs/market-data.md for the expected request/response
 * shapes, how to obtain a licence, and how to point this at a vendor gateway.
 */

import { config } from "@/lib/config";
import { safeNumber, safePositiveNumber } from "@/lib/validation";
import type {
  BarInterval,
  Company,
  DataMode,
  IndexQuote,
  MarketSummary,
  PriceBar,
  Quote,
} from "@/lib/types/market";
import { nairobiDate } from "@/lib/market-session";
import {
  ProviderNotConfiguredError,
  ProviderUpstreamError,
} from "./errors";
import type {
  HistoricalPriceQuery,
  MarketDataProvider,
  ProviderCapabilities,
} from "./types";

type Json = Record<string, unknown>;

const DATA_MODES: Record<string, DataMode> = {
  live: "live",
  realtime: "live",
  "real-time": "live",
  delayed: "delayed",
  "delayed-15m": "delayed",
  eod: "end-of-day",
  "end-of-day": "end-of-day",
  "end-of-day-statistics": "end-of-day",
};

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pick(source: Json, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function asArray(payload: unknown, keys = ["data", "results", "items"]): Json[] {
  if (Array.isArray(payload)) return payload as Json[];
  if (payload && typeof payload === "object") {
    for (const key of keys) {
      const value = (payload as Json)[key];
      if (Array.isArray(value)) return value as Json[];
    }
  }
  return [];
}

/** Normalise a ticker coming from an external feed. Uppercase, trimmed, safe. */
function normaliseTicker(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const ticker = raw.toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker) ? ticker : null;
}

export class NseMarketDataProvider implements MarketDataProvider {
  readonly id = "nse";
  readonly name: string;
  readonly attribution: string;
  readonly dataMode: DataMode;
  readonly limitations: string[];
  readonly capabilities: ProviderCapabilities = {
    intraday: false,
    historyYears: 5,
    indices: true,
    turnover: true,
    referenceData: false,
  };

  constructor() {
    if (!config.nse.baseUrl || !config.nse.apiKey) {
      const missing: string[] = [];
      if (!config.nse.baseUrl) missing.push("NSE_MARKET_API_BASE_URL");
      if (!config.nse.apiKey) missing.push("NSE_MARKET_API_KEY");
      throw new ProviderNotConfiguredError("nse", missing);
    }

    this.dataMode = DATA_MODES[config.nse.feed.toLowerCase()] ?? "delayed";
    this.name = config.nse.vendor
      ? `NSE market data via ${config.nse.vendor}`
      : "Licensed NSE market data feed";
    this.attribution = config.nse.vendor
      ? `Source: ${config.nse.vendor} / Nairobi Securities Exchange. Licensed for display — redistribution restricted.`
      : "Source: Nairobi Securities Exchange. Licensed for display — redistribution restricted.";

    this.limitations = [
      this.dataMode === "live"
        ? "Live feed: display permitted under the NSE licence; redistribution prohibited."
        : this.dataMode === "delayed"
          ? "Delayed feed: values lag the market by at least 15 minutes."
          : "End-of-day feed: values are official closing statistics, not intraday prices.",
      "Redistribution of NSE market data requires a redistribution licence.",
    ];
  }

  private async request<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const base = config.nse.baseUrl as string;
    const url = new URL(`${base.replace(/\/$/, "")}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.nse.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.nse.apiKey as string}`,
          "x-api-key": config.nse.apiKey as string,
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new ProviderUpstreamError(
          this.id,
          `upstream responded ${response.status} ${response.statusText || ""}`.trim()
        );
      }

      const body: unknown = await response.json();
      // External payloads are untrusted: only plain objects/arrays proceed.
      if (typeof body !== "object" || body === null) {
        throw new ProviderUpstreamError(this.id, "unexpected response shape");
      }
      return body as T;
    } catch (error) {
      if (error instanceof ProviderUpstreamError) throw error;
      const reason = error instanceof Error ? error.message : "unknown error";
      throw new ProviderUpstreamError(this.id, reason);
    } finally {
      clearTimeout(timeout);
    }
  }

  async getCompanies(): Promise<Company[]> {
    const body = await this.request<unknown>("/companies");
    return asArray(body)
      .map((row) => this.normaliseCompany(row))
      .filter((company): company is Company => company !== null);
  }

  async getCompany(ticker: string): Promise<Company | null> {
    const wanted = normaliseTicker(ticker);
    if (!wanted) return null;
    const companies = await this.getCompanies();
    return companies.find((company) => company.ticker === wanted) ?? null;
  }

  async getQuotes(tickers?: string[]): Promise<Quote[]> {
    const body = await this.request<unknown>("/quotes", {
      symbols: (tickers ?? []).join(","),
    });
    const rows = asArray(body)
      .map((row) => this.normaliseQuote(row))
      .filter((quote): quote is Quote => quote !== null);

    if (!tickers?.length) return rows;
    const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
    return rows.filter((quote) => wanted.has(quote.ticker));
  }

  async getHistoricalPrices(query: HistoricalPriceQuery): Promise<PriceBar[]> {
    const ticker = normaliseTicker(query.ticker);
    if (!ticker) return [];
    if (query.interval !== "1d") return []; // most licensed EOD feeds are daily

    const body = await this.request<unknown>(`/prices/${encodeURIComponent(ticker)}`, {
      from: query.from,
      to: query.to,
      interval: query.interval,
    });

    return asArray(body)
      .map((row) => this.normaliseBar(row))
      .filter((bar): bar is PriceBar => bar !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getIndices(): Promise<IndexQuote[]> {
    const body = await this.request<unknown>("/indices");
    return asArray(body)
      .map((row) => this.normaliseIndex(row))
      .filter((index): index is IndexQuote => index !== null);
  }

  async getMarketSummary(): Promise<MarketSummary | null> {
    const body = await this.request<unknown>("/summary");
    const row = Array.isArray(body) ? body[0] : (body as Json);
    if (!row || typeof row !== "object") return null;

    const sessionDate = asString(pick(row, ["sessionDate", "session_date", "date"])) ?? nairobiDate();
    const asOf =
      asString(pick(row, ["asOf", "as_of", "timestamp", "updatedAt"])) ??
      `${sessionDate}T15:00:00+03:00`;

    const int = (keys: string[]) => {
      const value = safeNumber(pick(row, keys));
      return value === null ? null : Math.round(value);
    };

    return {
      sessionDate,
      asOf,
      advancing: int(["advancing", "advancers", "advances"]) ?? 0,
      declining: int(["declining", "decliners", "declines"]) ?? 0,
      unchanged: int(["unchanged", "unchanged_count"]) ?? 0,
      totalCompanies: int(["totalCompanies", "total_companies", "listed"]) ?? 0,
      totalVolume: safePositiveNumber(pick(row, ["totalVolume", "total_volume", "volume"])),
      totalTurnover: safePositiveNumber(pick(row, ["totalTurnover", "total_turnover", "turnover"])),
      totalMarketCap: safePositiveNumber(
        pick(row, ["totalMarketCap", "marketCap", "market_capitalisation"])
      ),
      marketReturn: safeNumber(pick(row, ["marketReturn", "market_return", "changePercent"])),
      pricedCompanies:
        int(["pricedCompanies", "priced_companies", "traded"]) ??
        int(["totalCompanies", "total_companies"]) ??
        0,
    };
  }

  /* ---------------------------- normalisation ---------------------------- */

  private normaliseCompany(row: Json): Company | null {
    const ticker = normaliseTicker(pick(row, ["ticker", "symbol", "code"]));
    if (!ticker) return null;
    const sector = asString(pick(row, ["sector", "segment", "marketSegment"])) ?? "Unclassified";
    return {
      id: asString(pick(row, ["id", "companyId", "isin"])) ?? ticker.toLowerCase(),
      ticker,
      name: asString(pick(row, ["name", "companyName", "securityName"])) ?? ticker,
      sector,
      sectorSlug: sector
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      industry: asString(pick(row, ["industry", "subSector"])) ?? sector,
      description: asString(pick(row, ["description", "profile"])),
      logoUrl: asString(pick(row, ["logoUrl", "logo", "logo_url"])),
      sharesOutstanding: safePositiveNumber(
        pick(row, ["sharesOutstanding", "shares_outstanding", "sharesInIssue"])
      ),
      marketCap: safePositiveNumber(pick(row, ["marketCap", "market_cap", "capitalisation"])),
      listingStatus:
        asString(pick(row, ["listingStatus", "status"]))?.toLowerCase() === "suspended"
          ? "suspended"
          : asString(pick(row, ["listingStatus", "status"]))?.toLowerCase() === "delisted"
            ? "delisted"
            : "listed",
      currency: asString(pick(row, ["currency"])) ?? "KES",
      country: asString(pick(row, ["country"])) ?? "KE",
      crossListing: pick(row, ["crossListing", "cross_listing"]) === true,
      isin: asString(pick(row, ["isin"])),
    };
  }

  private normaliseQuote(row: Json): Quote | null {
    const ticker = normaliseTicker(pick(row, ["ticker", "symbol", "code"]));
    if (!ticker) return null;

    const price = safePositiveNumber(pick(row, ["price", "last", "close", "lastTradedPrice"]));
    const previousClose = safePositiveNumber(
      pick(row, ["previousClose", "prevClose", "previous_close"])
    );
    const changePercent =
      safeNumber(pick(row, ["changePercent", "change_percent", "pctChange"])) ??
      (price !== null && previousClose !== null && previousClose > 0
        ? ((price - previousClose) / previousClose) * 100
        : null);

    return {
      ticker,
      price,
      previousClose,
      change:
        safeNumber(pick(row, ["change", "changeAbs", "change_value"])) ??
        (price !== null && previousClose !== null ? price - previousClose : null),
      changePercent,
      dayHigh: safePositiveNumber(pick(row, ["dayHigh", "high", "day_high"])),
      dayLow: safePositiveNumber(pick(row, ["dayLow", "low", "day_low"])),
      volume: safePositiveNumber(pick(row, ["volume", "sharesTraded", "volume_traded"])),
      turnover: safePositiveNumber(pick(row, ["turnover", "value", "value_traded"])),
      marketCap: safePositiveNumber(pick(row, ["marketCap", "market_cap", "capitalisation"])),
      asOf: asString(pick(row, ["asOf", "as_of", "timestamp", "lastUpdated"])) ??
        `${nairobiDate()}T15:00:00+03:00`,
      sessionDate:
        asString(pick(row, ["sessionDate", "session_date", "date"])) ?? nairobiDate(),
    };
  }

  private normaliseBar(row: Json): PriceBar | null {
    const date = asString(pick(row, ["date", "tradeDate", "session", "timestamp"]));
    if (!date) return null;
    const close = safePositiveNumber(pick(row, ["close", "closingPrice", "price"]));
    return {
      date: date.slice(0, 10),
      open: safePositiveNumber(pick(row, ["open", "openingPrice"])),
      high: safePositiveNumber(pick(row, ["high", "dayHigh"])),
      low: safePositiveNumber(pick(row, ["low", "dayLow"])),
      close,
      adjustedClose: safePositiveNumber(
        pick(row, ["adjustedClose", "adjusted_close", "adjClose"])
      ),
      volume: safePositiveNumber(pick(row, ["volume", "sharesTraded"])),
      turnover: safePositiveNumber(pick(row, ["turnover", "value", "value_traded"])),
    };
  }

  private normaliseIndex(row: Json): IndexQuote | null {
    const symbol = asString(pick(row, ["symbol", "code", "name"]));
    if (!symbol) return null;
    const value = safeNumber(pick(row, ["value", "level", "indexValue"]));
    const changePercent = safeNumber(pick(row, ["changePercent", "change_percent"]));
    return {
      symbol: symbol.toUpperCase().replace(/\s+/g, "-"),
      name: asString(pick(row, ["name", "indexName"])) ?? symbol,
      description: asString(pick(row, ["description"])),
      value,
      change: safeNumber(pick(row, ["change", "changeAbs"])),
      changePercent,
      asOf: asString(pick(row, ["asOf", "as_of", "timestamp"])) ??
        `${nairobiDate()}T15:00:00+03:00`,
    };
  }
}

/** Guard used by the factory so callers get a typed error, not a crash. */
export function isNseProviderAvailable(): boolean {
  return Boolean(config.nse.baseUrl && config.nse.apiKey);
}

export type { BarInterval };
