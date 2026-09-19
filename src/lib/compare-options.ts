/**
 * Picker options and default selections for the comparison workspace.
 *
 * Lives outside the client component so the page (a server component) can
 * compute the same defaults the interactive picker would — the server render
 * and the first client render must agree, and a client module cannot export a
 * function that the server calls.
 */

export type CompanyOption = { ticker: string; name: string; sector: string };
export type SectorOption = { slug: string; name: string };

/**
 * Used only when the company register is empty — the page prefers real
 * constituents so a comparison never opens on a ticker that does not exist.
 */
const FALLBACK_STOCKS = ["KCB", "EQTY", "SCOM"];
const FALLBACK_SECTORS = ["banking", "insurance", "telecommunication"];

/** First three listed companies, so the default comparison is always real. */
export function defaultStockSelection(companies: CompanyOption[]): string[] {
  return companies.length > 0 ? companies.slice(0, 3).map((company) => company.ticker) : FALLBACK_STOCKS;
}

/** First three market segments, so the default comparison is always real. */
export function defaultSectorSelection(sectors: SectorOption[]): string[] {
  return sectors.length > 0 ? sectors.slice(0, 3).map((sector) => sector.slug) : FALLBACK_SECTORS;
}
