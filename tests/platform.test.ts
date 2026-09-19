import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCompactKes,
  formatPercent,
  formatPrice,
  changeClass,
  NOT_AVAILABLE,
} from "../src/lib/format";
import { isTradingDay, previousTradingDay, tradingDaysBetween } from "../src/lib/market-session";
import { checkRateLimit } from "../src/lib/rate-limit";
import { cached, clearCache, invalidate } from "../src/lib/cache";
import { MemoryRepository } from "../src/lib/db/repositories/memory-repository";

describe("formatting", () => {
  it("renders missing numbers as an em dash, never zero", () => {
    assert.equal(formatPrice(null), NOT_AVAILABLE);
    assert.equal(formatPrice(undefined), NOT_AVAILABLE);
    assert.equal(formatPercent(null), NOT_AVAILABLE);
    assert.equal(formatCompactKes(null), NOT_AVAILABLE);
  });

  it("formats KES amounts compactly", () => {
    assert.equal(formatCompactKes(1_210_000_000_000), "KSh 1.21T");
    assert.equal(formatCompactKes(288_690_000_000), "KSh 288.69B");
    assert.equal(formatCompactKes(14_200_000), "KSh 14.20M");
  });

  it("signs percentages", () => {
    assert.equal(formatPercent(2.416), "+2.42%");
    assert.equal(formatPercent(-1.2), "-1.20%");
  });

  it("maps direction to the stylesheet classes", () => {
    assert.equal(changeClass(1), "green");
    assert.equal(changeClass(-1), "red");
    assert.equal(changeClass(0), "");
    assert.equal(changeClass(null), "");
  });
});

describe("trading calendar", () => {
  it("treats weekends as non-trading", () => {
    assert.equal(isTradingDay("2026-09-19"), false); // Saturday
    assert.equal(isTradingDay("2026-09-20"), false); // Sunday
    assert.equal(isTradingDay("2026-09-18"), true); // Friday
  });

  it("steps back to the previous trading day", () => {
    assert.equal(previousTradingDay("2026-09-19"), "2026-09-18");
  });

  it("enumerates sessions in order", () => {
    const days = tradingDaysBetween("2026-09-14", "2026-09-18");
    assert.deepEqual(days, ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      assert.equal(checkRateLimit(key, 3).allowed, true);
    }
    const blocked = checkRateLimit(key, 3);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);
  });
});

describe("cache", () => {
  it("reuses a value within its TTL", async () => {
    clearCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    assert.equal(await cached("k", 60, loader), 1);
    assert.equal(await cached("k", 60, loader), 1);
    assert.equal(calls, 1);
  });

  it("drops entries on invalidate", async () => {
    clearCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    await cached("quotes:all", 60, loader);
    invalidate("quotes:");
    assert.equal(await cached("quotes:all", 60, loader), 2);
  });

  it("bypasses the cache when the TTL is zero", async () => {
    clearCache();
    let calls = 0;
    await cached("z", 0, async () => {
      calls += 1;
      return calls;
    });
    await cached("z", 0, async () => {
      calls += 1;
      return calls;
    });
    assert.equal(calls, 2);
  });
});

describe("MemoryRepository", () => {
  it("starts empty and reports that it is not durable", async () => {
    const repository = new MemoryRepository();
    assert.equal(repository.isPersistent, false);
    assert.deepEqual(await repository.getStoredQuotes(), []);
    assert.equal(await repository.latestQuoteSession(), null);
  });

  it("round-trips quotes and bars", async () => {
    const repository = new MemoryRepository();
    await repository.upsertQuotes([
      {
        ticker: "KCB",
        price: 84.25,
        previousClose: 81.15,
        change: 3.1,
        changePercent: 3.82,
        dayHigh: 85.1,
        dayLow: 81.5,
        volume: 1_000,
        turnover: 84_250,
        marketCap: 264_800_000_000,
        asOf: "2026-09-18T15:00:00+03:00",
        sessionDate: "2026-09-18",
      },
    ]);
    assert.equal(await repository.latestQuoteSession(), "2026-09-18");

    await repository.upsertPriceBars("KCB", [
      { date: "2026-09-17", open: 81, high: 82, low: 80, close: 81.15, adjustedClose: 81.15, volume: 10, turnover: 811 },
      { date: "2026-09-18", open: 81.15, high: 85.1, low: 81, close: 84.25, adjustedClose: 84.25, volume: 12, turnover: 1011 },
    ]);
    const bars = await repository.getPriceBars("KCB", "2026-09-18", "2026-09-18");
    assert.equal(bars.length, 1);
    assert.equal(bars[0].close, 84.25);
    assert.equal(await repository.latestBarDate("KCB"), "2026-09-18");
  });

  it("never invents economic observations", async () => {
    const repository = new MemoryRepository();
    assert.deepEqual(await repository.getEconomicObservations("KE.CBK.CBR"), []);
  });
});
