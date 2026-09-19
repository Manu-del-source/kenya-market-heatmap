import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ValidationError,
  parseBoundedInt,
  parseDate,
  parseEnum,
  parseSearch,
  parseSlug,
  parseTicker,
  parseTickerList,
  safeNumber,
  safePositiveNumber,
} from "../src/lib/validation";

describe("parseTicker", () => {
  it("normalises to uppercase", () => {
    assert.equal(parseTicker("scom"), "SCOM");
    assert.equal(parseTicker("  kcb  "), "KCB");
  });

  it("rejects junk rather than coercing it", () => {
    assert.throws(() => parseTicker("../etc/passwd"), ValidationError);
    assert.throws(() => parseTicker(""), ValidationError);
    assert.throws(() => parseTicker("WAY_TOO_LONG_TICKER_NAME"), ValidationError);
  });
});

describe("parseSlug", () => {
  it("accepts kebab-case slugs only", () => {
    assert.equal(parseSlug("Energy-Petroleum"), "energy-petroleum");
    assert.throws(() => parseSlug("Energy & Petroleum"), ValidationError);
  });
});

describe("parseDate", () => {
  it("accepts ISO dates and rejects garbage", () => {
    assert.equal(parseDate("2026-09-18"), "2026-09-18");
    assert.throws(() => parseDate("18/09/2026"), ValidationError);
    assert.throws(() => parseDate("2026-13-45"), ValidationError);
  });
});

describe("parseEnum", () => {
  const allowed = ["1D", "1W", "1M"] as const;

  it("applies the fallback for missing values", () => {
    assert.equal(parseEnum(null, allowed, "range", "1M"), "1M");
  });

  it("rejects unknown values instead of silently ignoring them", () => {
    assert.throws(() => parseEnum("10Y", allowed, "range"), ValidationError);
  });
});

describe("parseBoundedInt", () => {
  it("clamps the fallback and enforces bounds", () => {
    assert.equal(parseBoundedInt(null, { min: 1, max: 10, fallback: 3, field: "page" }), 3);
    assert.equal(parseBoundedInt("5", { min: 1, max: 10, fallback: 1, field: "page" }), 5);
    assert.throws(() => parseBoundedInt("99", { min: 1, max: 10, fallback: 1, field: "page" }), ValidationError);
  });
});

describe("parseSearch", () => {
  it("strips control characters and caps length", () => {
    assert.equal(parseSearch("  safari  "), "safari");
    assert.equal(parseSearch("a".repeat(500))?.length, 64);
    assert.equal(parseSearch("   "), null);
  });
});

describe("parseTickerList", () => {
  it("filters invalid entries and honours the cap", () => {
    assert.deepEqual(parseTickerList("kcb, scom ,!!,"), ["KCB", "SCOM"]);
    assert.throws(() => parseTickerList(Array.from({ length: 60 }, () => "KCB").join(","), 50), ValidationError);
  });
});

describe("number sanitising", () => {
  it("converts unusable provider values to null", () => {
    assert.equal(safeNumber(""), null);
    assert.equal(safeNumber("abc"), null);
    assert.equal(safeNumber("12.5"), 12.5);
    assert.equal(safePositiveNumber(-3), null);
    assert.equal(safePositiveNumber(5), 5);
  });
});
