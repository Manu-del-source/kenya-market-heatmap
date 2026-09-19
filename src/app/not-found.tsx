import Link from "next/link";

export default function NotFound() {
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
      </header>

      <section style={{ padding: "60px 0" }}>
        <span className="eyebrow">404</span>
        <h2 style={{ margin: "6px 0 10px", fontSize: 24 }}>Page not found</h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
          The page you requested does not exist. It may have been renamed, or the
          instrument may not be part of the NSE universe we track.
        </p>

        <p style={{ marginTop: 20 }}>
          <Link className="ghost-button" href="/">
            Back to the market heatmap
          </Link>
        </p>
      </section>
    </main>
  );
}
