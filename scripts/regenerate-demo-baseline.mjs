import fs from "node:fs";

// ticker, price, changePct, volume, marketCap(KES), annualVolPct
const rows = [
  ["KCB", 84.25, 3.82, 4236500, 264800000000, 32],
  ["EQTY", 65.5, 2.41, 3118400, 249500000000, 34],
  ["ABSA", 31.25, 1.92, 1052300, 178900000000, 30],
  ["COOP", 33.55, 2.1, 1987600, 241200000000, 31],
  ["NCBA", 87.5, -0.83, 894200, 143600000000, 28],
  ["SCBK", 329.5, 1.85, 118900, 204700000000, 24],
  ["IMH", 79.5, 3.27, 342100, 63400000000, 27],
  ["SBIC", 281.25, 2.23, 96400, 113000000000, 26],
  ["BKG", 58.75, 3.24, 74200, 39000000000, 29],
  ["BRIT", 19.0, 4.72, 2764800, 24900000000, 38],
  ["JUB", 411.5, 2.24, 74300, 29600000000, 25],
  ["KNRE", 4.14, 1.54, 1543200, 20600000000, 35],
  ["CIC", 4.71, 0.86, 932700, 13900000000, 36],
  ["LBTY", 9.12, -1.78, 411500, 5500000000, 33],
  ["SLAM", 11.0, 2.05, 268900, 4500000000, 34],
  ["SCOM", 18.7, 2.87, 8912700, 751000000000, 26],
  ["KPLC", 21.95, 1.61, 6784300, 121300000000, 42],
  ["KEGN", 7.0, -1.13, 1842300, 46200000000, 40],
  ["TOTL", 46.15, 2.28, 388600, 35000000000, 29],
  ["UMME", 5.48, -2.92, 2145000, 10900000000, 30],
  ["EABL", 286.25, 1.44, 214500, 226100000000, 24],
  ["BAT", 551.0, 2.64, 61800, 55100000000, 22],
  ["CARB", 17.5, 0.58, 98400, 2800000000, 31],
  ["UNGA", 40.9, 3.29, 143600, 6100000000, 28],
  ["FTGH", 1.5, -2.6, 156700, 600000000, 55],
  ["KUKZ", 315.0, 0.42, 12900, 59200000000, 21],
  ["WTK", 169.25, 1.19, 34800, 3300000000, 23],
  ["SASN", 12.4, 0.81, 48600, 2800000000, 27],
  ["KAPC", 105.0, -0.94, 9800, 1700000000, 26],
  ["BAMB", 62.0, 3.5, 88300, 22500000000, 30],
  ["PORT", 116.5, 3.5, 12400, 4600000000, 32],
  ["OCH", 7.74, -1.84, 154200, 1100000000, 44],
  ["KQ", 6.48, 4.91, 3972800, 5800000000, 48],
  ["NMG", 18.0, 1.12, 64200, 3400000000, 26],
  ["SGL", 6.08, 0.66, 121400, 2400000000, 39],
  ["LKL", 2.92, 0.75, 84900, 1800000000, 42],
  ["SCAN", 2.03, -2.39, 486300, 2500000000, 46],
  ["TPSE", 14.0, 1.45, 21400, 2500000000, 25],
  ["NBV", 1.27, -1.61, 612800, 1300000000, 52],
  ["TCL", 1.12, 2.75, 398100, 900000000, 57],
  ["NSE", 9.5, 0.53, 34600, 2300000000, 33],
  ["CARG", 45.75, -0.65, 98400, 3600000000, 34],
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

const out = {};
for (const [ticker, price, changePct, volume, marketCap, vol] of rows) {
  const seed = rng(hash(ticker + ":baseline"));
  const previousClose = round2(price / (1 + changePct / 100));
  const dayRange = price * (0.008 + seed() * 0.02);
  const dayHigh = round2(Math.max(price, previousClose) + dayRange * 0.6);
  const dayLow = round2(Math.min(price, previousClose) - dayRange * 0.6);
  // 52-week envelope scaled by annualised volatility.
  const stretch = vol / 100;
  const week52High = round2(price * (1 + stretch * (0.55 + seed() * 0.5)));
  const week52Low = round2(Math.max(0.05, price * (1 - stretch * (0.45 + seed() * 0.4))));
  out[ticker] = {
    price,
    previousClose,
    changePercent: changePct,
    dayHigh,
    dayLow,
    volume,
    marketCap,
    week52High,
    week52Low,
    annualVolatilityPercent: vol,
  };
}

const payload = {
  $comment:
    "SAMPLE DATA ANCHORS — NOT MARKET DATA. These numbers are synthetic reference points used only by the demo provider (src/lib/providers/demo-provider.ts) to generate a deterministic price history for development, tests and screenshots. They are not NSE prices, must never be presented as real, and are replaced automatically once a licensed feed (MARKET_DATA_PROVIDER=nse) or an imported end-of-day file is available.",
  generatedBy: "scripts/regenerate-demo-baseline.mjs",
  currency: "KES",
  disclaimer:
    "Not investment advice. Not market data. Figures are illustrative and carry no relationship to the actual price, volume or capitalisation of any listed company.",
  anchors: out,
};

fs.writeFileSync("src/data/demo-baseline.json", JSON.stringify(payload, null, 2) + "\n");
console.log("wrote", Object.keys(out).length, "anchors");
