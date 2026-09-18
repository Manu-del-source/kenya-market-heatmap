/**
 * PROTOTYPE / SIMULATED DATA
 * --------------------------
 * All figures in this file are static mock values for the Kenya Market
 * Intelligence prototype. Nothing here is live NSE data and it must never be
 * presented as such.
 */

export type Timeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

export const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M", "6M", "1Y"];

export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  /** % change vs. previous close. */
  change: number;
  /** KES. Prototype/mock. */
  previousClose: number;
  dayHigh: number;
  dayLow: number;
  /** Shares traded. Prototype/mock. */
  volume: number;
  week52High: number;
  week52Low: number;
  /** KES. Prototype/mock. */
  marketCap: number;
  /**
   * Mock historical closes, deterministic per (symbol, timeframe) so charts do
   * not jump between renders. In real use this would come from an NSE API.
   */
  historicalPrices: Record<Timeframe, number[]>;
};

/**
 * Seeded pseudo-random generator (mulberry32). Same seed -> same series, so
 * mock charts are stable instead of flickering on every render.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSymbol(symbol: string) {
  let hash = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    hash ^= symbol.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Generate a mock close-price series that ends at `endPrice`. The path is a
 * seeded random walk, adjusted so the terminal value matches the quote.
 */
function generateHistory(
  symbol: string,
  endPrice: number,
  points: number,
  volatility: number,
  drift: number
): number[] {
  const rand = mulberry32(hashSymbol(symbol));
  const prices: number[] = [];
  let price = endPrice;

  // Walk backwards from today so the last point equals the current price.
  for (let i = 0; i < points; i++) {
    prices.push(price);
    const shock = (rand() * 2 - 1) * volatility * price;
    price = Math.max(0.05, price - drift * price - shock);
  }

  return prices.reverse().map(round2);
}

const HISTORY_CONFIG: Record<
  Timeframe,
  { points: number; volatility: number; drift: number }
> = {
  "1D": { points: 78, volatility: 0.004, drift: 0 }, // ~13 five-min bars/hour
  "1W": { points: 65, volatility: 0.01, drift: 0 }, // 5 days x 13 bars
  "1M": { points: 22, volatility: 0.018, drift: 0.002 },
  "3M": { points: 64, volatility: 0.02, drift: 0.002 },
  "6M": { points: 128, volatility: 0.022, drift: 0.003 },
  "1Y": { points: 252, volatility: 0.024, drift: 0.003 },
};

type StockSeed = Omit<Stock, "historicalPrices">;

function buildHistory(seed: StockSeed): Stock["historicalPrices"] {
  const history = {} as Stock["historicalPrices"];
  for (const timeframe of TIMEFRAMES) {
    const { points, volatility, drift } = HISTORY_CONFIG[timeframe];
    history[timeframe] = generateHistory(
      `${seed.symbol}:${timeframe}`,
      seed.price,
      points,
      volatility,
      drift
    );
  }
  return history;
}

function finalizeStock(seed: StockSeed): Stock {
  return { ...seed, historicalPrices: buildHistory(seed) };
}

/**
 * NAIROBI SECURITIES EXCHANGE — LISTED EQUITIES (SUBSET)
 * Prices are static reference values captured for the prototype only.
 */
const stockSeeds: StockSeed[] = [
  // Banking
  {
    symbol: "KCB",
    name: "KCB Group",
    sector: "Banking",
    price: 84.25,
    change: 3.82,
    previousClose: 81.15,
    dayHigh: 85.1,
    dayLow: 81.5,
    volume: 4_236_500,
    week52High: 91.4,
    week52Low: 52.1,
    marketCap: 264_800_000_000,
  },
  {
    symbol: "EQTY",
    name: "Equity Group",
    sector: "Banking",
    price: 65.5,
    change: 2.41,
    previousClose: 63.96,
    dayHigh: 66.2,
    dayLow: 63.5,
    volume: 3_118_400,
    week52High: 68.75,
    week52Low: 38.2,
    marketCap: 249_500_000_000,
  },
  {
    symbol: "ABSA",
    name: "Absa Bank Kenya",
    sector: "Banking",
    price: 31.25,
    change: 1.92,
    previousClose: 30.66,
    dayHigh: 31.6,
    dayLow: 30.4,
    volume: 1_052_300,
    week52High: 34.9,
    week52Low: 22.6,
    marketCap: 178_900_000_000,
  },
  {
    symbol: "COOP",
    name: "Co-operative Bank",
    sector: "Banking",
    price: 33.55,
    change: 2.1,
    previousClose: 32.86,
    dayHigh: 33.9,
    dayLow: 32.6,
    volume: 1_987_600,
    week52High: 35.2,
    week52Low: 20.9,
    marketCap: 241_200_000_000,
  },
  {
    symbol: "NCBA",
    name: "NCBA Group",
    sector: "Banking",
    price: 87.5,
    change: -0.83,
    previousClose: 88.23,
    dayHigh: 89.0,
    dayLow: 86.9,
    volume: 894_200,
    week52High: 95.3,
    week52Low: 54.5,
    marketCap: 143_600_000_000,
  },
  {
    symbol: "SCBK",
    name: "Standard Chartered Kenya",
    sector: "Banking",
    price: 329.5,
    change: 1.85,
    previousClose: 323.52,
    dayHigh: 332.0,
    dayLow: 322.0,
    volume: 118_900,
    week52High: 348.0,
    week52Low: 214.0,
    marketCap: 204_700_000_000,
  },
  {
    symbol: "IMH",
    name: "I&M Group",
    sector: "Banking",
    price: 79.5,
    change: 3.27,
    previousClose: 76.99,
    dayHigh: 80.3,
    dayLow: 76.5,
    volume: 342_100,
    week52High: 84.0,
    week52Low: 48.3,
    marketCap: 63_400_000_000,
  },
  {
    symbol: "SBIC",
    name: "Stanbic Holdings",
    sector: "Banking",
    price: 281.25,
    change: 2.23,
    previousClose: 275.12,
    dayHigh: 283.5,
    dayLow: 274.0,
    volume: 96_400,
    week52High: 296.0,
    week52Low: 172.5,
    marketCap: 113_000_000_000,
  },

  // Insurance
  {
    symbol: "BRIT",
    name: "Britam Holdings",
    sector: "Insurance",
    price: 19.0,
    change: 4.72,
    previousClose: 18.14,
    dayHigh: 19.35,
    dayLow: 18.0,
    volume: 2_764_800,
    week52High: 21.1,
    week52Low: 11.9,
    marketCap: 24_900_000_000,
  },
  {
    symbol: "JUB",
    name: "Jubilee Holdings",
    sector: "Insurance",
    price: 411.5,
    change: 2.24,
    previousClose: 402.49,
    dayHigh: 415.0,
    dayLow: 401.0,
    volume: 74_300,
    week52High: 438.0,
    week52Low: 282.0,
    marketCap: 29_600_000_000,
  },
  {
    symbol: "KNRE",
    name: "Kenya Reinsurance",
    sector: "Insurance",
    price: 4.14,
    change: 1.54,
    previousClose: 4.08,
    dayHigh: 4.2,
    dayLow: 4.05,
    volume: 1_543_200,
    week52High: 4.85,
    week52Low: 3.02,
    marketCap: 20_600_000_000,
  },
  {
    symbol: "CIC",
    name: "CIC Insurance",
    sector: "Insurance",
    price: 4.71,
    change: 0.86,
    previousClose: 4.67,
    dayHigh: 4.78,
    dayLow: 4.6,
    volume: 932_700,
    week52High: 5.2,
    week52Low: 3.1,
    marketCap: 13_900_000_000,
  },
  {
    symbol: "LBTY",
    name: "Liberty Kenya",
    sector: "Insurance",
    price: 9.12,
    change: -1.78,
    previousClose: 9.29,
    dayHigh: 9.35,
    dayLow: 9.0,
    volume: 411_500,
    week52High: 11.4,
    week52Low: 6.8,
    marketCap: 5_500_000_000,
  },
  {
    symbol: "SASN",
    name: "Sanlam Kenya",
    sector: "Insurance",
    price: 24.55,
    change: 2.54,
    previousClose: 23.94,
    dayHigh: 24.9,
    dayLow: 23.7,
    volume: 268_900,
    week52High: 26.4,
    week52Low: 15.2,
    marketCap: 4_900_000_000,
  },

  // Energy
  {
    symbol: "KPLC",
    name: "Kenya Power",
    sector: "Energy",
    price: 21.95,
    change: 1.61,
    previousClose: 21.6,
    dayHigh: 22.3,
    dayLow: 21.3,
    volume: 6_784_300,
    week52High: 25.9,
    week52Low: 12.4,
    marketCap: 121_300_000_000,
  },
  {
    symbol: "TOTL",
    name: "TotalEnergies Kenya",
    sector: "Energy",
    price: 46.15,
    change: 2.28,
    previousClose: 45.12,
    dayHigh: 46.8,
    dayLow: 44.9,
    volume: 388_600,
    week52High: 51.2,
    week52Low: 31.4,
    marketCap: 35_000_000_000,
  },
  {
    symbol: "UMME",
    name: "Umeme",
    sector: "Energy",
    price: 5.48,
    change: -2.92,
    previousClose: 5.64,
    dayHigh: 5.7,
    dayLow: 5.4,
    volume: 2_145_000,
    week52High: 7.1,
    week52Low: 4.2,
    marketCap: 10_900_000_000,
  },

  // Manufacturing
  {
    symbol: "EABL",
    name: "East African Breweries",
    sector: "Manufacturing",
    price: 286.25,
    change: 1.44,
    previousClose: 282.18,
    dayHigh: 288.0,
    dayLow: 281.0,
    volume: 214_500,
    week52High: 298.0,
    week52Low: 186.0,
    marketCap: 226_100_000_000,
  },
  {
    symbol: "BAT",
    name: "BAT Kenya",
    sector: "Manufacturing",
    price: 551.0,
    change: 2.64,
    previousClose: 536.82,
    dayHigh: 556.0,
    dayLow: 534.0,
    volume: 61_800,
    week52High: 585.0,
    week52Low: 355.0,
    marketCap: 55_100_000_000,
  },
  {
    symbol: "CARB",
    name: "Car & General",
    sector: "Manufacturing",
    price: 45.75,
    change: -0.65,
    previousClose: 46.05,
    dayHigh: 46.5,
    dayLow: 45.2,
    volume: 98_400,
    week52High: 52.0,
    week52Low: 33.9,
    marketCap: 3_600_000_000,
  },
  {
    symbol: "MCHN",
    name: "Marshalls (E.A.)",
    sector: "Manufacturing",
    price: 12.4,
    change: 0.0,
    previousClose: 12.4,
    dayHigh: 12.65,
    dayLow: 12.15,
    volume: 156_700,
    week52High: 15.8,
    week52Low: 9.4,
    marketCap: 2_100_000_000,
  },
  {
    symbol: "KACH",
    name: "Kakuzi",
    sector: "Manufacturing",
    price: 315.0,
    change: 0.42,
    previousClose: 313.68,
    dayHigh: 320.0,
    dayLow: 312.0,
    volume: 12_900,
    week52High: 340.0,
    week52Low: 276.0,
    marketCap: 59_200_000_000,
  },

  // Telecommunications
  {
    symbol: "SAF",
    name: "Safaricom",
    sector: "Telecommunications",
    price: 18.7,
    change: 2.87,
    previousClose: 18.18,
    dayHigh: 18.95,
    dayLow: 18.05,
    volume: 8_912_700,
    week52High: 21.4,
    week52Low: 11.6,
    marketCap: 751_000_000_000,
  },

  // Investment
  {
    symbol: "BKG",
    name: "Buckinghams",
    sector: "Investment",
    price: 58.75,
    change: 3.24,
    previousClose: 56.91,
    dayHigh: 59.4,
    dayLow: 56.5,
    volume: 74_200,
    week52High: 63.0,
    week52Low: 38.5,
    marketCap: 3_900_000_000,
  },
  {
    symbol: "SCAN",
    name: "WPP Scangroup",
    sector: "Investment",
    price: 2.03,
    change: -2.39,
    previousClose: 2.08,
    dayHigh: 2.1,
    dayLow: 1.98,
    volume: 486_300,
    week52High: 3.4,
    week52Low: 1.6,
    marketCap: 2_500_000_000,
  },
  {
    symbol: "NBV",
    name: "NBV",
    sector: "Investment",
    price: 1.27,
    change: -1.61,
    previousClose: 1.29,
    dayHigh: 1.31,
    dayLow: 1.24,
    volume: 612_800,
    week52High: 2.1,
    week52Low: 0.95,
    marketCap: 1_300_000_000,
  },
  {
    symbol: "OCH",
    name: "Olympia Capital",
    sector: "Investment",
    price: 7.74,
    change: -1.84,
    previousClose: 7.89,
    dayHigh: 7.95,
    dayLow: 7.6,
    volume: 154_200,
    week52High: 9.8,
    week52Low: 5.6,
    marketCap: 1_100_000_000,
  },
  {
    symbol: "TCL",
    name: "TransCentury",
    sector: "Investment",
    price: 1.12,
    change: 2.75,
    previousClose: 1.09,
    dayHigh: 1.15,
    dayLow: 1.07,
    volume: 398_100,
    week52High: 1.98,
    week52Low: 0.72,
    marketCap: 900_000_000,
  },

  // Agriculture
  {
    symbol: "UNGA",
    name: "Unga Group",
    sector: "Agriculture",
    price: 40.9,
    change: 3.29,
    previousClose: 39.6,
    dayHigh: 41.5,
    dayLow: 39.2,
    volume: 143_600,
    week52High: 46.0,
    week52Low: 26.5,
    marketCap: 6_100_000_000,
  },
  {
    symbol: "WTK",
    name: "Williamson Tea",
    sector: "Agriculture",
    price: 169.25,
    change: 1.19,
    previousClose: 167.26,
    dayHigh: 172.0,
    dayLow: 166.0,
    volume: 34_800,
    week52High: 188.0,
    week52Low: 121.0,
    marketCap: 3_300_000_000,
  },

  // Construction
  {
    symbol: "PORT",
    name: "Portland Cement",
    sector: "Construction",
    price: 116.5,
    change: 3.5,
    previousClose: 112.56,
    dayHigh: 118.4,
    dayLow: 112.0,
    volume: 88_300,
    week52High: 126.0,
    week52Low: 74.0,
    marketCap: 4_600_000_000,
  },

  // Media
  {
    symbol: "SGL",
    name: "Standard Group",
    sector: "Media",
    price: 6.08,
    change: 0.66,
    previousClose: 6.04,
    dayHigh: 6.2,
    dayLow: 5.95,
    volume: 121_400,
    week52High: 8.9,
    week52Low: 4.1,
    marketCap: 2_400_000_000,
  },
  {
    symbol: "LAPR",
    name: "Longhorn Publishers",
    sector: "Media",
    price: 2.92,
    change: 0.75,
    previousClose: 2.9,
    dayHigh: 3.0,
    dayLow: 2.85,
    volume: 84_900,
    week52High: 4.2,
    week52Low: 2.1,
    marketCap: 1_800_000_000,
  },

  // Transport
  {
    symbol: "KQ",
    name: "Kenya Airways",
    sector: "Transport",
    price: 6.48,
    change: 4.91,
    previousClose: 6.18,
    dayHigh: 6.62,
    dayLow: 6.1,
    volume: 3_972_800,
    week52High: 7.85,
    week52Low: 3.95,
    marketCap: 5_800_000_000,
  },
  {
    symbol: "MSC",
    name: "Mashonaland Holdings",
    sector: "Transport",
    price: 12.15,
    change: -1.14,
    previousClose: 12.29,
    dayHigh: 12.5,
    dayLow: 11.9,
    volume: 210_600,
    week52High: 15.4,
    week52Low: 8.7,
    marketCap: 1_900_000_000,
  },
];

export const stocks: Stock[] = stockSeeds.map(finalizeStock);

export function getStockBySymbol(symbol: string) {
  return stocks.find((stock) => stock.symbol === symbol);
}
