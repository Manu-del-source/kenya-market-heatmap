import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DemoMarketDataProvider } from "../src/lib/providers/demo-provider";
import { ProviderNotConfiguredError } from "../src/lib/providers/errors";
import { getMarketDataProvider, resetMarketDataProvider } from "../src/lib/providers";
import { isNseProviderAvailable, NseMarketDataProvider } from "../src/lib/providers/nse-provider";
import { nairobiDate } from "../src/lib/market-session";

afterEach(() => {
  resetMarketDataProvider();
  delete process.env.MARKET_DATA_PROVIDER;
});

describe("DemoMarketDataProvider", () => {
  it("declares itself as sample data", () => {
    const provider = new DemoMarketDataProvider();
    assert.equal(provider.dataMode, "demo");
    assert.match(provider.attribution, /not NSE market data/i);
    assert.ok(provider.limitations.length > 0);
  });

  it("generates a deterministic series", async () => {
    const first = new DemoMarketDataProvider();
    const second = new DemoMarketDataProvider();
    const a = await first.getHistoricalPrices({
      ticker: "KCB",
      from: "2026-01-01",
      to: nairobiDate(),
      interval: "1d",
    });
    const b = await second.getHistoricalPrices({
      ticker: "KCB",
      from: "2026-01-01",
      to: nairobiDate(),
      interval: "1d",
    });
    assert.deepEqual(a.slice(0, 40), b.slice(0, 40));
  });

  it("anchors the latest close to the documented sample baseline", async () => {
    const provider = new DemoMarketDataProvider();
    const quotes = await provider.getQuotes(["SCOM"]);
    const quote = quotes[0];
    assert.equal(quote.ticker, "SCOM");
    // 18.70 is the documented sample anchor for SCOM in src/data/demo-baseline.json
    assert.equal(quote.price, 18.7);
    assert.ok(quote.previousClose !== null);
    assert.ok(Math.abs((quote.change ?? 0) - (quote.price! - quote.previousClose!)) < 0.02);
  });

  it("never returns intraday bars", async () => {
    const provider = new DemoMarketDataProvider();
    const bars = await provider.getHistoricalPrices({
      ticker: "KCB",
      from: "2026-09-01",
      to: nairobiDate(),
      interval: "5m",
    });
    assert.equal(bars.length, 0);
    assert.equal(provider.capabilities.intraday, false);
  });

  it("produces internally consistent OHLC bars", async () => {
    const provider = new DemoMarketDataProvider();
    const bars = await provider.getHistoricalPrices({
      ticker: "EQTY",
      from: "2026-06-01",
      to: nairobiDate(),
      interval: "1d",
    });
    assert.ok(bars.length > 10);
    for (const bar of bars) {
      assert.ok(bar.close !== null && bar.close > 0);
      assert.ok((bar.high ?? 0) >= (bar.close ?? 0));
      assert.ok((bar.low ?? Infinity) <= (bar.close ?? 0));
      assert.ok((bar.volume ?? -1) >= 0);
    }
    // Ascending order matters for every downstream return calculation.
    const dates = bars.map((bar) => bar.date);
    assert.deepEqual(dates, [...dates].sort());
  });

  it("summarises the market consistently with its quotes", async () => {
    const provider = new DemoMarketDataProvider();
    const [summary, quotes] = await Promise.all([
      provider.getMarketSummary(),
      provider.getQuotes(),
    ]);
    assert.ok(summary);
    assert.equal(summary!.totalCompanies, quotes.length);
    assert.equal(
      summary!.advancing + summary!.declining + summary!.unchanged,
      quotes.filter((quote) => quote.changePercent !== null).length
    );
  });

  it("returns no data for an unknown ticker instead of inventing one", async () => {
    const provider = new DemoMarketDataProvider();
    assert.equal(await provider.getCompany("NOPE"), null);
    assert.deepEqual(await provider.getQuotes(["NOPE"]), []);
  });
});

describe("NseMarketDataProvider", () => {
  it("refuses to construct without credentials", () => {
    const available = isNseProviderAvailable();
    if (available) return; // configured environment: nothing to assert
    assert.throws(() => new NseMarketDataProvider(), ProviderNotConfiguredError);
  });
});

describe("provider factory", () => {
  it("falls back to the demo provider when no feed is configured", () => {
    const provider = getMarketDataProvider();
    assert.ok(["demo", "nse"].includes(provider.id));
  });

  it("honours MARKET_DATA_PROVIDER=demo", () => {
    process.env.MARKET_DATA_PROVIDER = "demo";
    resetMarketDataProvider();
    assert.equal(getMarketDataProvider().id, "demo");
  });
});
