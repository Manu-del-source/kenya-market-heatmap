/**
 * Display formatting helpers. Kept in one place so every surface formats KES,
 * percentages and dates identically (and so nothing invents precision the
 * source does not have).
 */

export const KES_CURRENCY = "KES";

/** Values the source did not report. Rendered as an em dash, never as 0. */
export const NOT_AVAILABLE = "—";

export function formatNumber(
  value: number | null | undefined,
  options: { maximumFractionDigits?: number; minimumFractionDigits?: number } = {}
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value.toLocaleString("en-KE", {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
}

export function formatPrice(value: number | null | undefined): string {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatKes(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? NOT_AVAILABLE
    : `KSh ${formatPrice(value)}`;
}

/** Compact KES amounts for dense panels: 1.21T / 288.69B / 14.2M. */
export function formatCompactKes(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}KSh ${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}KSh ${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}KSh ${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}KSh ${(abs / 1e3).toFixed(1)}K`;
  return `${sign}KSh ${abs.toFixed(0)}`;
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toLocaleString("en-KE")}`;
}

/** Signed percentage, e.g. `+2.41%`. Null renders as an em dash. */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function formatSignedNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NOT_AVAILABLE;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

/** Direction class used by the existing stylesheet (`.green` / `.red`). */
export function changeClass(value: number | null | undefined): "" | "green" | "red" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "green" : "red";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date.toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date.toLocaleDateString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Uppercase report-style date used in the header, e.g. `19 SEP, 2026`. */
export function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date
    .toLocaleDateString("en-GB", {
      timeZone: "Africa/Nairobi",
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
}
