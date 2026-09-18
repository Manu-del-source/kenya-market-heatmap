import { LiveStock } from "@/hooks/useLiveStocks";

type MarketOverviewProps = {
  stocks: LiveStock[];
};

function formatCompact(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-KE");
}

export default function MarketOverview({ stocks }: MarketOverviewProps) {
  // Counts are derived from the dataset — never hardcoded.
  const advancing = stocks.filter((stock) => stock.change > 0).length;
  const declining = stocks.filter((stock) => stock.change < 0).length;
  const unchanged = stocks.filter((stock) => stock.change === 0).length;
  const totalListed = stocks.length;

  // Market-wide aggregates have no per-stock source in the prototype dataset,
  // so they are derived estimates and clearly labelled MOCK in the UI.
  const totalVolume = stocks.reduce((sum, stock) => sum + stock.volume, 0);
  const turnover = stocks.reduce(
    (sum, stock) => sum + stock.volume * stock.price,
    0
  );

  const cards = [
    { label: "ADVANCING", value: String(advancing), className: "green" },
    { label: "DECLINING", value: String(declining), className: "red" },
    { label: "UNCHANGED", value: String(unchanged), className: "" },
    { label: "LISTED", value: String(totalListed), className: "" },
    { label: "TURNOVER", value: `KSh ${formatCompact(turnover)}`, className: "", mock: true },
    { label: "VOLUME", value: formatCompact(totalVolume), className: "", mock: true },
  ];

  return (
    <div className="market-overview" aria-label="Market overview">
      {cards.map((card) => (
        <div className="overview-card" key={card.label}>
          <span>{card.label}</span>
          <strong className={card.className}>{card.value}</strong>
          {card.mock && (
            <em className="mock-tag" title="Prototype estimate, not live">
              MOCK
            </em>
          )}
        </div>
      ))}
    </div>
  );
}
