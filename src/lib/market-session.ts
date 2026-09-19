/**
 * NSE trading-calendar helpers.
 *
 * Only used for labelling and for generating demo series — the platform never
 * infers a trading day from data it has not seen. Public holidays are a curated
 * table and are marked approximate: official NSE calendars should replace it
 * before any date-sensitive feature ships.
 */

import { MARKET_SESSION, MARKET_TIMEZONE } from "./config";

/** Fixed Kenyan public holidays (MM-DD). Approximate, non-exhaustive. */
const FIXED_HOLIDAYS = new Set([
  "01-01", // New Year's Day
  "05-01", // Labour Day
  "06-01", // Madaraka Day
  "10-20", // Mashujaa Day
  "12-12", // Jamhuri Day
  "12-25", // Christmas Day
  "12-26", // Boxing Day
]);

/** Anonymous Gregorian algorithm for Easter Sunday. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function holidaySet(year: number): Set<string> {
  const holidays = new Set(FIXED_HOLIDAYS);
  const easter = easterSunday(year);
  const addOffset = (offsetDays: number) => {
    const date = new Date(easter.getTime() + offsetDays * 86_400_000);
    holidays.add(date.toISOString().slice(5, 10));
  };
  addOffset(-2); // Good Friday
  addOffset(1); // Easter Monday
  return holidays;
}

const holidayCache = new Map<number, Set<string>>();

/** ISO date (YYYY-MM-DD) in Africa/Nairobi for a given instant. */
export function nairobiDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MARKET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isTradingDay(isoDate: string): boolean {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  const day = date.getUTCDay();
  if (!(MARKET_SESSION.tradingDays as readonly number[]).includes(day)) return false;
  const year = date.getUTCFullYear();
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = holidaySet(year);
    holidayCache.set(year, holidays);
  }
  return !holidays.has(isoDate.slice(5));
}

/** The most recent trading day at or before `isoDate`. */
export function previousTradingDay(isoDate: string): string {
  const cursor = new Date(`${isoDate}T00:00:00Z`);
  for (let i = 0; i < 14; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isTradingDay(iso)) return iso;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return isoDate;
}

/** Enumerate trading days in [from, to]. Bounded to protect against bad input. */
export function tradingDaysBetween(from: string, to: string, max = 4000): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const days: string[] = [];
  const cursor = start;
  let guard = 0;
  while (cursor <= end && days.length < max && guard < max * 2) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isTradingDay(iso)) days.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}

export type MarketStatus = "open" | "closed" | "pre-open" | "post-close" | "weekend";

/**
 * Session status in Nairobi time. Purely informational — the platform never
 * claims a feed is live just because the clock says the market is open.
 */
export function marketStatus(now: Date = new Date()): MarketStatus {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MARKET_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));

  if (weekday === "Sat" || weekday === "Sun") return "weekend";
  const open = MARKET_SESSION.openHour * 60 + MARKET_SESSION.openMinute;
  const close = MARKET_SESSION.closeHour * 60 + MARKET_SESSION.closeMinute;
  if (minutes < open) return "pre-open";
  if (minutes >= close) return "post-close";
  return "open";
}

export const MARKET_STATUS_LABEL: Record<MarketStatus, string> = {
  open: "Market open",
  closed: "Market closed",
  "pre-open": "Pre-open",
  "post-close": "After close",
  weekend: "Weekend — market closed",
};
