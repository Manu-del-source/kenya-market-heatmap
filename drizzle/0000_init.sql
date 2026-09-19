-- Kenya Market Intelligence — initial schema.
-- Generated to match src/lib/db/schema.ts (Drizzle ORM). Keep the two in sync.
-- Applied by `npm run db:migrate`.

CREATE TABLE IF NOT EXISTS "sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sectors_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"sector_id" integer,
	"industry" text,
	"description" text,
	"logo_url" text,
	"shares_outstanding" bigint,
	"market_cap" numeric(24, 2),
	"listing_status" text DEFAULT 'listed' NOT NULL,
	"currency" text DEFAULT 'KES' NOT NULL,
	"country" text DEFAULT 'KE' NOT NULL,
	"cross_listing" boolean DEFAULT false NOT NULL,
	"isin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_ticker_unique" UNIQUE("ticker")
);

CREATE TABLE IF NOT EXISTS "price_bars" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"trade_date" date NOT NULL,
	"interval" text DEFAULT '1d' NOT NULL,
	"open" numeric(18, 4),
	"high" numeric(18, 4),
	"low" numeric(18, 4),
	"close" numeric(18, 4),
	"adjusted_close" numeric(18, 4),
	"volume" bigint,
	"turnover" numeric(24, 2),
	"source" text DEFAULT 'unknown' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_bars_company_date_interval_unique" UNIQUE("company_id","trade_date","interval")
);

CREATE TABLE IF NOT EXISTS "quotes" (
	"company_id" integer PRIMARY KEY NOT NULL,
	"session_date" date NOT NULL,
	"price" numeric(18, 4),
	"previous_close" numeric(18, 4),
	"change_abs" numeric(18, 4),
	"change_percent" double precision,
	"day_high" numeric(18, 4),
	"day_low" numeric(18, 4),
	"volume" bigint,
	"turnover" numeric(24, 2),
	"market_cap" numeric(24, 2),
	"as_of" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'unknown' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "market_indices" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"value" numeric(18, 4),
	"change_abs" numeric(18, 4),
	"change_percent" double precision,
	"as_of" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "market_indices_symbol_unique" UNIQUE("symbol")
);

CREATE TABLE IF NOT EXISTS "index_bars" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
	"index_id" integer NOT NULL,
	"trade_date" date NOT NULL,
	"value" numeric(18, 4),
	"source" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "index_bars_index_date_unique" UNIQUE("index_id","trade_date")
);

CREATE TABLE IF NOT EXISTS "market_snapshots" (
	"trade_date" date PRIMARY KEY NOT NULL,
	"advancing" integer DEFAULT 0 NOT NULL,
	"declining" integer DEFAULT 0 NOT NULL,
	"unchanged" integer DEFAULT 0 NOT NULL,
	"unpriced" integer DEFAULT 0 NOT NULL,
	"total_volume" bigint,
	"total_turnover" numeric(24, 2),
	"total_market_cap" numeric(24, 2),
	"market_return" double precision,
	"as_of" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'unknown' NOT NULL
);

CREATE TABLE IF NOT EXISTS "sector_snapshots" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
	"sector_id" integer NOT NULL,
	"trade_date" date NOT NULL,
	"companies" integer DEFAULT 0 NOT NULL,
	"market_value" numeric(24, 2),
	"daily_return" double precision,
	"weekly_return" double precision,
	"monthly_return" double precision,
	"turnover" numeric(24, 2),
	"advancing" integer DEFAULT 0 NOT NULL,
	"declining" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "sector_snapshots_sector_date_unique" UNIQUE("sector_id","trade_date")
);

CREATE TABLE IF NOT EXISTS "economic_indicators" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"frequency" text NOT NULL,
	"description" text,
	"source" text NOT NULL,
	"source_url" text,
	"license" text,
	"first_observation" date,
	"last_observation" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economic_indicators_series_unique" UNIQUE("series_id")
);

CREATE TABLE IF NOT EXISTS "economic_observations" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY NOT NULL,
	"indicator_id" integer NOT NULL,
	"observation_date" date NOT NULL,
	"value" double precision,
	"as_of" timestamp with time zone,
	"source" text DEFAULT 'unknown' NOT NULL,
	CONSTRAINT "economic_observations_series_date_unique" UNIQUE("indicator_id","observation_date")
);

CREATE TABLE IF NOT EXISTS "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"message" text
);

-- Foreign keys
ALTER TABLE "companies" ADD CONSTRAINT "companies_sector_id_sectors_id_fk"
	FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "price_bars" ADD CONSTRAINT "price_bars_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "index_bars" ADD CONSTRAINT "index_bars_index_id_market_indices_id_fk"
	FOREIGN KEY ("index_id") REFERENCES "public"."market_indices"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sector_snapshots" ADD CONSTRAINT "sector_snapshots_sector_id_sectors_id_fk"
	FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "economic_observations" ADD CONSTRAINT "economic_observations_indicator_id_economic_indicators_id_fk"
	FOREIGN KEY ("indicator_id") REFERENCES "public"."economic_indicators"("id") ON DELETE cascade ON UPDATE no action;

-- Indexes
CREATE INDEX IF NOT EXISTS "companies_sector_idx" ON "companies" USING btree ("sector_id");
CREATE INDEX IF NOT EXISTS "price_bars_date_idx" ON "price_bars" USING btree ("trade_date");
CREATE INDEX IF NOT EXISTS "quotes_session_idx" ON "quotes" USING btree ("session_date");
CREATE INDEX IF NOT EXISTS "market_snapshots_date_idx" ON "market_snapshots" USING btree ("trade_date");
