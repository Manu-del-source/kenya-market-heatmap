/**
 * /watchlist — local watchlist (Phase 11).
 *
 * No authentication yet, by design: the list lives in the browser and the page
 * is marked noindex because its contents differ per visitor. When accounts
 * arrive, only `useWatchlist` and this page's data fetch need to change.
 */

import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import WatchlistBoard from "@/components/WatchlistBoard";
import { buildMetadata } from "@/lib/seo";
import { buildMeta } from "@/lib/services/market-service";

export const metadata = buildMetadata({
  title: "Watchlist",
  description:
    "Track NSE-listed companies in a private, browser-based watchlist with live-ish quotes, daily change and sector exposure.",
  path: "/watchlist",
  noindex: true,
});

export default function WatchlistPage() {
  const meta = buildMeta();

  return (
    <main className="dashboard">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <div>
            <h1>KENYA MARKET INTELLIGENCE</h1>
            <p>MARKETS • COMPANIES • DATA</p>
          </div>
        </div>

        <div className="report">
          <span>WATCHLIST</span>
          <strong>SAVED IN BROWSER</strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">PERSONAL TRACKING</span>
          <h2>Watchlist</h2>
          <p>
            Stored locally in this browser — no account, no server-side profile.
            Add companies from the heatmap or any company page.
          </p>
        </div>
      </section>

      <WatchlistBoard />

      <SiteFooter meta={meta} />
    </main>
  );
}
