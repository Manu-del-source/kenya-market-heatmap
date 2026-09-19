/**
 * Postgres repository (Drizzle ORM + node-postgres).
 *
 * Activated automatically when `DATABASE_URL` is set. Kept behind a lazy
 * dynamic import so that deployments without a database never load the `pg`
 * driver, and so a misconfigured connection string cannot break the build.
 *
 * Every write is an idempotent upsert: re-running ingestion is safe, which is
 * what makes scheduled ingestion and backfills tractable.
 */

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "@/lib/config";
import type {
  IndexQuote,
  MarketSummary,
  PriceBar,
  Quote,
  SectorStat,
} from "@/lib/types/market";
import * as schema from "../schema";
import {
  companies,
  economicIndicators,
  economicObservations,
  indexBars,
  ingestionRuns,
  marketIndices,
  marketSnapshots,
  priceBars,
  quotes,
  sectorSnapshots,
  sectors,
} from "../schema";
import type {
  CompanyRecord,
  EconomicIndicatorRecord,
  EconomicObservationRecord,
  IngestionRunRecord,
  MarketRepository,
  SectorRecord,
} from "../repository";

type Database = NodePgDatabase<typeof schema>;

const DEFAULT_BAR_INTERVAL = "1d";

export class PostgresRepository implements MarketRepository {
  readonly kind = "postgres" as const;
  readonly isPersistent = true;

  private dbPromise: Promise<Database> | null = null;
  /** ticker → company primary key, refreshed lazily. */
  private companyCache: Map<string, number> | null = null;
  /** sector slug → sector primary key, refreshed lazily. */
  private sectorCache: Map<string, number> | null = null;

  private async getDb(): Promise<Database> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = (async () => {
      const [{ drizzle }, pgModule] = await Promise.all([
        import("drizzle-orm/node-postgres"),
        import("pg"),
      ]);
      const Pool = (pgModule as unknown as { Pool: typeof import("pg").Pool }).Pool;
      const pool = new Pool({
        connectionString: config.databaseUrl,
        max: Number(process.env.DATABASE_POOL_MAX ?? 5),
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 10_000,
      });
      return drizzle(pool, { schema });
    })();

    return this.dbPromise;
  }

  /* --------------------------- id resolution ---------------------------- */

  private async sectorIds(db: Database, refresh = false): Promise<Map<string, number>> {
    if (this.sectorCache && !refresh) return this.sectorCache;
    const rows = await db.select({ id: sectors.id, slug: sectors.slug }).from(sectors);
    this.sectorCache = new Map(rows.map((row) => [row.slug, row.id]));
    return this.sectorCache;
  }

  private async companyIds(db: Database, refresh = false): Promise<Map<string, number>> {
    if (this.companyCache && !refresh) return this.companyCache;
    const rows = await db
      .select({ id: companies.id, ticker: companies.ticker })
      .from(companies);
    this.companyCache = new Map(rows.map((row) => [row.ticker.toUpperCase(), row.id]));
    return this.companyCache;
  }

  private async resolveCompanyId(db: Database, ticker: string): Promise<number | null> {
    const symbol = ticker.toUpperCase();
    const cached = (await this.companyIds(db)).get(symbol);
    if (cached !== undefined) return cached;
    const refreshed = await this.companyIds(db, true);
    return refreshed.get(symbol) ?? null;
  }

  /* ---------------------------- reference ------------------------------- */

  async upsertSectors(rows: SectorRecord[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.getDb();
    await db
      .insert(sectors)
      .values(rows.map((row) => ({ slug: row.slug, name: row.name, description: row.description })))
      .onConflictDoUpdate({
        target: sectors.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
        },
      });
    await this.sectorIds(db, true);
    return rows.length;
  }

  async listSectors(): Promise<SectorRecord[]> {
    const db = await this.getDb();
    return db
      .select({
        slug: sectors.slug,
        name: sectors.name,
        description: sectors.description,
      })
      .from(sectors)
      .orderBy(asc(sectors.name));
  }

  async upsertCompanies(rows: CompanyRecord[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.getDb();

    // Make sure every sector referenced exists, then resolve ids.
    const slugs = [...new Set(rows.map((row) => row.sectorSlug))];
    await db
      .insert(sectors)
      .values(slugs.map((slug) => ({ slug, name: slug, description: null })))
      .onConflictDoNothing({ target: sectors.slug });
    const sectorMap = await this.sectorIds(db, true);

    await db
      .insert(companies)
      .values(
        rows.map((row) => ({
          ticker: row.ticker.toUpperCase(),
          name: row.name,
          sectorId: sectorMap.get(row.sectorSlug) ?? null,
          industry: row.industry,
          description: row.description,
          logoUrl: row.logoUrl,
          sharesOutstanding: row.sharesOutstanding,
          marketCap: row.marketCap,
          listingStatus: row.listingStatus,
          currency: row.currency,
          country: row.country,
          crossListing: row.crossListing,
          isin: row.isin,
        }))
      )
      .onConflictDoUpdate({
        target: companies.ticker,
        set: {
          name: sql`excluded.name`,
          sectorId: sql`excluded.sector_id`,
          industry: sql`excluded.industry`,
          description: sql`excluded.description`,
          logoUrl: sql`excluded.logo_url`,
          sharesOutstanding: sql`excluded.shares_outstanding`,
          marketCap: sql`excluded.market_cap`,
          listingStatus: sql`excluded.listing_status`,
          currency: sql`excluded.currency`,
          country: sql`excluded.country`,
          crossListing: sql`excluded.cross_listing`,
          isin: sql`excluded.isin`,
          updatedAt: sql`now()`,
        },
      });

    await this.companyIds(db, true);
    return rows.length;
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    const db = await this.getDb();
    const rows = await db
      .select({
        id: companies.id,
        ticker: companies.ticker,
        name: companies.name,
        sector: sectors.name,
        sectorSlug: sectors.slug,
        industry: companies.industry,
        description: companies.description,
        logoUrl: companies.logoUrl,
        sharesOutstanding: companies.sharesOutstanding,
        marketCap: companies.marketCap,
        listingStatus: companies.listingStatus,
        currency: companies.currency,
        country: companies.country,
        crossListing: companies.crossListing,
        isin: companies.isin,
      })
      .from(companies)
      .leftJoin(sectors, eq(companies.sectorId, sectors.id))
      .orderBy(asc(companies.ticker));

    return rows.map((row): CompanyRecord => ({
      id: String(row.id),
      ticker: row.ticker,
      name: row.name,
      sector: row.sector ?? "Unclassified",
      sectorSlug: row.sectorSlug ?? "unclassified",
      industry: row.industry ?? row.sector ?? "Unclassified",
      description: row.description,
      logoUrl: row.logoUrl,
      sharesOutstanding: row.sharesOutstanding,
      marketCap: row.marketCap,
      listingStatus:
        row.listingStatus === "suspended" || row.listingStatus === "delisted"
          ? row.listingStatus
          : "listed",
      currency: row.currency,
      country: row.country,
      crossListing: row.crossListing,
      isin: row.isin,
    }));
  }

  async getCompany(ticker: string): Promise<CompanyRecord | null> {
    const all = await this.listCompanies();
    return all.find((company) => company.ticker === ticker.toUpperCase()) ?? null;
  }

  /* ---------------------------- market data ----------------------------- */

  async upsertQuotes(rows: Quote[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.getDb();
    const ids = await this.companyIds(db);

    const values = [];
    for (const quote of rows) {
      const companyId = ids.get(quote.ticker.toUpperCase());
      if (companyId === undefined) continue; // unknown instrument: skip, never invent
      values.push({
        companyId,
        sessionDate: quote.sessionDate,
        price: quote.price,
        previousClose: quote.previousClose,
        changeAbs: quote.change,
        changePercent: quote.changePercent,
        dayHigh: quote.dayHigh,
        dayLow: quote.dayLow,
        volume: quote.volume,
        turnover: quote.turnover,
        marketCap: quote.marketCap,
        asOf: new Date(quote.asOf),
        source: "ingestion",
      });
    }
    if (values.length === 0) return 0;

    await db
      .insert(quotes)
      .values(values)
      .onConflictDoUpdate({
        target: quotes.companyId,
        set: {
          sessionDate: sql`excluded.session_date`,
          price: sql`excluded.price`,
          previousClose: sql`excluded.previous_close`,
          changeAbs: sql`excluded.change_abs`,
          changePercent: sql`excluded.change_percent`,
          dayHigh: sql`excluded.day_high`,
          dayLow: sql`excluded.day_low`,
          volume: sql`excluded.volume`,
          turnover: sql`excluded.turnover`,
          marketCap: sql`excluded.market_cap`,
          asOf: sql`excluded.as_of`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });

    return values.length;
  }

  async getStoredQuotes(tickers?: string[]): Promise<Quote[]> {
    const db = await this.getDb();
    const rows = await db
      .select({
        ticker: companies.ticker,
        sessionDate: quotes.sessionDate,
        price: quotes.price,
        previousClose: quotes.previousClose,
        changeAbs: quotes.changeAbs,
        changePercent: quotes.changePercent,
        dayHigh: quotes.dayHigh,
        dayLow: quotes.dayLow,
        volume: quotes.volume,
        turnover: quotes.turnover,
        marketCap: quotes.marketCap,
        asOf: quotes.asOf,
      })
      .from(quotes)
      .innerJoin(companies, eq(quotes.companyId, companies.id))
      .where(
        tickers?.length
          ? inArray(
              companies.ticker,
              tickers.map((ticker) => ticker.toUpperCase())
            )
          : undefined
      );

    return rows.map((row): Quote => ({
      ticker: row.ticker,
      price: row.price,
      previousClose: row.previousClose,
      change: row.changeAbs,
      changePercent: row.changePercent,
      dayHigh: row.dayHigh,
      dayLow: row.dayLow,
      volume: row.volume,
      turnover: row.turnover,
      marketCap: row.marketCap,
      asOf: row.asOf.toISOString(),
      sessionDate: row.sessionDate,
    }));
  }

  async latestQuoteSession(): Promise<string | null> {
    const db = await this.getDb();
    const rows = await db
      .select({ sessionDate: quotes.sessionDate })
      .from(quotes)
      .orderBy(desc(quotes.sessionDate))
      .limit(1);
    return rows[0]?.sessionDate ?? null;
  }

  async upsertPriceBars(ticker: string, bars: PriceBar[]): Promise<number> {
    if (bars.length === 0) return 0;
    const db = await this.getDb();
    const companyId = await this.resolveCompanyId(db, ticker);
    if (companyId === null) return 0;

    // Chunked to stay well inside Postgres' parameter limit (65 535).
    const chunkSize = 500;
    let written = 0;
    for (let i = 0; i < bars.length; i += chunkSize) {
      const chunk = bars.slice(i, i + chunkSize);
      await db
        .insert(priceBars)
        .values(
          chunk.map((bar) => ({
            companyId,
            tradeDate: bar.date,
            interval: DEFAULT_BAR_INTERVAL,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            adjustedClose: bar.adjustedClose,
            volume: bar.volume,
            turnover: bar.turnover,
            source: "ingestion",
          }))
        )
        .onConflictDoUpdate({
          target: [priceBars.companyId, priceBars.tradeDate, priceBars.interval],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            adjustedClose: sql`excluded.adjusted_close`,
            volume: sql`excluded.volume`,
            turnover: sql`excluded.turnover`,
            source: sql`excluded.source`,
          },
        });
      written += chunk.length;
    }
    return written;
  }

  async getPriceBars(ticker: string, from: string, to: string): Promise<PriceBar[]> {
    const db = await this.getDb();
    const companyId = await this.resolveCompanyId(db, ticker);
    if (companyId === null) return [];

    const rows = await db
      .select()
      .from(priceBars)
      .where(
        and(
          eq(priceBars.companyId, companyId),
          eq(priceBars.interval, DEFAULT_BAR_INTERVAL),
          gte(priceBars.tradeDate, from),
          lte(priceBars.tradeDate, to)
        )
      )
      .orderBy(asc(priceBars.tradeDate));

    return rows.map((row): PriceBar => ({
      date: row.tradeDate,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      adjustedClose: row.adjustedClose,
      volume: row.volume,
      turnover: row.turnover,
    }));
  }

  async getPriceBarsForTickers(
    tickers: string[],
    from: string,
    to: string,
    interval: string = DEFAULT_BAR_INTERVAL
  ): Promise<Record<string, PriceBar[]>> {
    if (tickers.length === 0) return {};
    const db = await this.getDb();
    const ids = await this.companyIds(db);

    const wanted = tickers.map((ticker) => ticker.toUpperCase());
    const companyIds = wanted
      .map((ticker) => ids.get(ticker))
      .filter((id): id is number => id !== undefined);
    if (companyIds.length === 0) return {};

    // One query for every requested instrument — the whole point of the batch
    // method. Results are grouped in memory; there is no per-ticker round-trip.
    const rows = await db
      .select({
        ticker: companies.ticker,
        tradeDate: priceBars.tradeDate,
        open: priceBars.open,
        high: priceBars.high,
        low: priceBars.low,
        close: priceBars.close,
        adjustedClose: priceBars.adjustedClose,
        volume: priceBars.volume,
        turnover: priceBars.turnover,
      })
      .from(priceBars)
      .innerJoin(companies, eq(priceBars.companyId, companies.id))
      .where(
        and(
          inArray(priceBars.companyId, companyIds),
          eq(priceBars.interval, interval),
          gte(priceBars.tradeDate, from),
          lte(priceBars.tradeDate, to)
        )
      )
      .orderBy(asc(priceBars.tradeDate));

    const grouped: Record<string, PriceBar[]> = {};
    for (const row of rows) {
      const list = grouped[row.ticker] ?? [];
      list.push({
        date: row.tradeDate,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        adjustedClose: row.adjustedClose,
        volume: row.volume,
        turnover: row.turnover,
      });
      grouped[row.ticker] = list;
    }
    return grouped;
  }

  async latestBarDate(ticker: string): Promise<string | null> {
    const db = await this.getDb();
    const companyId = await this.resolveCompanyId(db, ticker);
    if (companyId === null) return null;
    const rows = await db
      .select({ tradeDate: priceBars.tradeDate })
      .from(priceBars)
      .where(eq(priceBars.companyId, companyId))
      .orderBy(desc(priceBars.tradeDate))
      .limit(1);
    return rows[0]?.tradeDate ?? null;
  }

  async upsertIndices(rows: IndexQuote[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.getDb();

    await db
      .insert(marketIndices)
      .values(
        rows.map((index) => ({
          symbol: index.symbol.toUpperCase(),
          name: index.name,
          description: index.description,
          value: index.value,
          changeAbs: index.change,
          changePercent: index.changePercent,
          asOf: new Date(index.asOf),
          source: "ingestion",
        }))
      )
      .onConflictDoUpdate({
        target: marketIndices.symbol,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          value: sql`excluded.value`,
          changeAbs: sql`excluded.change_abs`,
          changePercent: sql`excluded.change_percent`,
          asOf: sql`excluded.as_of`,
          source: sql`excluded.source`,
        },
      });

    // Keep one history point per index per session for index charts.
    const stored = await db
      .select({ id: marketIndices.id, symbol: marketIndices.symbol })
      .from(marketIndices);
    const idBySymbol = new Map(stored.map((row) => [row.symbol, row.id]));
    const history = rows
      .map((index) => ({
        indexId: idBySymbol.get(index.symbol.toUpperCase()),
        tradeDate: index.asOf.slice(0, 10),
        value: index.value,
      }))
      .filter((row): row is { indexId: number; tradeDate: string; value: number | null } =>
        row.indexId !== undefined
      );

    if (history.length > 0) {
      await db
        .insert(indexBars)
        .values(history.map((row) => ({ ...row, source: "ingestion" })))
        .onConflictDoUpdate({
          target: [indexBars.indexId, indexBars.tradeDate],
          set: { value: sql`excluded.value`, source: sql`excluded.source` },
        });
    }

    return rows.length;
  }

  async getStoredIndices(): Promise<IndexQuote[]> {
    const db = await this.getDb();
    const rows = await db.select().from(marketIndices).orderBy(asc(marketIndices.symbol));
    return rows.map((row): IndexQuote => ({
      symbol: row.symbol,
      name: row.name,
      description: row.description,
      value: row.value,
      change: row.changeAbs,
      changePercent: row.changePercent,
      asOf: row.asOf.toISOString(),
    }));
  }

  async upsertMarketSnapshot(snapshot: MarketSummary): Promise<void> {
    const db = await this.getDb();
    await db
      .insert(marketSnapshots)
      .values({
        tradeDate: snapshot.sessionDate,
        advancing: snapshot.advancing,
        declining: snapshot.declining,
        unchanged: snapshot.unchanged,
        unpriced: Math.max(0, snapshot.totalCompanies - snapshot.pricedCompanies),
        totalVolume: snapshot.totalVolume,
        totalTurnover: snapshot.totalTurnover,
        totalMarketCap: snapshot.totalMarketCap,
        marketReturn: snapshot.marketReturn,
        asOf: new Date(snapshot.asOf),
        source: "ingestion",
      })
      .onConflictDoUpdate({
        target: marketSnapshots.tradeDate,
        set: {
          advancing: sql`excluded.advancing`,
          declining: sql`excluded.declining`,
          unchanged: sql`excluded.unchanged`,
          unpriced: sql`excluded.unpriced`,
          totalVolume: sql`excluded.total_volume`,
          totalTurnover: sql`excluded.total_turnover`,
          totalMarketCap: sql`excluded.total_market_cap`,
          marketReturn: sql`excluded.market_return`,
          asOf: sql`excluded.as_of`,
          source: sql`excluded.source`,
        },
      });
  }

  async getMarketSnapshot(tradeDate: string): Promise<MarketSummary | null> {
    const db = await this.getDb();
    const rows = await db
      .select()
      .from(marketSnapshots)
      .where(eq(marketSnapshots.tradeDate, tradeDate))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      sessionDate: row.tradeDate,
      asOf: row.asOf.toISOString(),
      advancing: row.advancing,
      declining: row.declining,
      unchanged: row.unchanged,
      totalCompanies: row.advancing + row.declining + row.unchanged + row.unpriced,
      totalVolume: row.totalVolume,
      totalTurnover: row.totalTurnover,
      totalMarketCap: row.totalMarketCap,
      marketReturn: row.marketReturn,
      pricedCompanies: row.advancing + row.declining + row.unchanged,
    };
  }

  async listMarketSnapshots(limit: number): Promise<MarketSummary[]> {
    const db = await this.getDb();
    const rows = await db
      .select()
      .from(marketSnapshots)
      .orderBy(desc(marketSnapshots.tradeDate))
      .limit(Math.min(Math.max(limit, 1), 500));
    return rows.map((row) => ({
      sessionDate: row.tradeDate,
      asOf: row.asOf.toISOString(),
      advancing: row.advancing,
      declining: row.declining,
      unchanged: row.unchanged,
      totalCompanies: row.advancing + row.declining + row.unchanged + row.unpriced,
      totalVolume: row.totalVolume,
      totalTurnover: row.totalTurnover,
      totalMarketCap: row.totalMarketCap,
      marketReturn: row.marketReturn,
      pricedCompanies: row.advancing + row.declining + row.unchanged,
    }));
  }

  async upsertSectorSnapshots(tradeDate: string, rows: SectorStat[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.getDb();
    const slugMap = await this.sectorIds(db);
    const values = rows
      .map((sector) => ({
        sectorId: slugMap.get(sector.sectorSlug),
        tradeDate,
        companies: sector.companies,
        marketValue: sector.marketValue,
        dailyReturn: sector.dailyReturn,
        weeklyReturn: sector.weeklyReturn,
        monthlyReturn: sector.monthlyReturn,
        turnover: sector.turnover,
        advancing: sector.advancing,
        declining: sector.declining,
        source: "ingestion",
      }))
      .filter((row): row is typeof row & { sectorId: number } => row.sectorId !== undefined);

    if (values.length === 0) return 0;

    await db
      .insert(sectorSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: [sectorSnapshots.sectorId, sectorSnapshots.tradeDate],
        set: {
          companies: sql`excluded.companies`,
          marketValue: sql`excluded.market_value`,
          dailyReturn: sql`excluded.daily_return`,
          weeklyReturn: sql`excluded.weekly_return`,
          monthlyReturn: sql`excluded.monthly_return`,
          turnover: sql`excluded.turnover`,
          advancing: sql`excluded.advancing`,
          declining: sql`excluded.declining`,
          source: sql`excluded.source`,
        },
      });
    return values.length;
  }

  /* ------------------------------ economy ------------------------------- */

  async upsertEconomicIndicators(rows: EconomicIndicatorRecord[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.getDb();
    await db
      .insert(economicIndicators)
      .values(
        rows.map((row) => ({
          seriesId: row.seriesId,
          name: row.name,
          category: row.category,
          unit: row.unit,
          frequency: row.frequency,
          description: row.description,
          source: row.source,
          sourceUrl: row.sourceUrl,
          license: row.license,
          firstObservation: row.firstObservation,
          lastObservation: row.lastObservation,
        }))
      )
      .onConflictDoUpdate({
        target: economicIndicators.seriesId,
        set: {
          name: sql`excluded.name`,
          category: sql`excluded.category`,
          unit: sql`excluded.unit`,
          frequency: sql`excluded.frequency`,
          description: sql`excluded.description`,
          source: sql`excluded.source`,
          sourceUrl: sql`excluded.source_url`,
          license: sql`excluded.license`,
          firstObservation: sql`excluded.first_observation`,
          lastObservation: sql`excluded.last_observation`,
          updatedAt: sql`now()`,
        },
      });
    return rows.length;
  }

  async listEconomicIndicators(): Promise<EconomicIndicatorRecord[]> {
    const db = await this.getDb();
    return db
      .select({
        seriesId: economicIndicators.seriesId,
        name: economicIndicators.name,
        category: economicIndicators.category,
        unit: economicIndicators.unit,
        frequency: economicIndicators.frequency,
        description: economicIndicators.description,
        source: economicIndicators.source,
        sourceUrl: economicIndicators.sourceUrl,
        license: economicIndicators.license,
        firstObservation: economicIndicators.firstObservation,
        lastObservation: economicIndicators.lastObservation,
      })
      .from(economicIndicators)
      .orderBy(asc(economicIndicators.seriesId));
  }

  async upsertEconomicObservations(
    seriesId: string,
    observations: EconomicObservationRecord[]
  ): Promise<number> {
    if (observations.length === 0) return 0;
    const db = await this.getDb();
    const rows = await db
      .select({ id: economicIndicators.id })
      .from(economicIndicators)
      .where(eq(economicIndicators.seriesId, seriesId))
      .limit(1);
    const indicatorId = rows[0]?.id;
    if (indicatorId === undefined) return 0;

    const chunkSize = 500;
    let written = 0;
    for (let i = 0; i < observations.length; i += chunkSize) {
      const chunk = observations.slice(i, i + chunkSize);
      await db
        .insert(economicObservations)
        .values(
          chunk.map((observation) => ({
            indicatorId,
            observationDate: observation.date,
            value: observation.value,
            asOf: observation.asOf ? new Date(observation.asOf) : null,
            source: "ingestion",
          }))
        )
        .onConflictDoUpdate({
          target: [economicObservations.indicatorId, economicObservations.observationDate],
          set: {
            value: sql`excluded.value`,
            asOf: sql`excluded.as_of`,
            source: sql`excluded.source`,
          },
        });
      written += chunk.length;
    }
    return written;
  }

  async getEconomicObservations(
    seriesId: string,
    from?: string,
    to?: string
  ): Promise<EconomicObservationRecord[]> {
    const db = await this.getDb();
    const rows = await db
      .select({
        date: economicObservations.observationDate,
        value: economicObservations.value,
        asOf: economicObservations.asOf,
      })
      .from(economicObservations)
      .innerJoin(
        economicIndicators,
        eq(economicObservations.indicatorId, economicIndicators.id)
      )
      .where(
        and(
          eq(economicIndicators.seriesId, seriesId),
          from ? gte(economicObservations.observationDate, from) : undefined,
          to ? lte(economicObservations.observationDate, to) : undefined
        )
      )
      .orderBy(asc(economicObservations.observationDate));

    return rows.map((row) => ({
      date: row.date,
      value: row.value,
      asOf: row.asOf ? row.asOf.toISOString() : null,
    }));
  }

  /* ---------------------------- operations ------------------------------ */

  async recordIngestionRun(run: IngestionRunRecord): Promise<void> {
    const db = await this.getDb();
    await db.insert(ingestionRuns).values({
      provider: run.provider,
      kind: run.kind,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      rowsWritten: run.rowsWritten,
      message: run.message,
    });
  }
}
