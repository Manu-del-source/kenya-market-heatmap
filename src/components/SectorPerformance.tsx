import { LiveStock } from "@/hooks/useLiveStocks";

type SectorPerformanceProps = {
  stocks: LiveStock[];
};

export default function SectorPerformance({ stocks }: SectorPerformanceProps) {
  const sectorMap = new Map<
    string,
    { count: number; changeSum: number; advancing: number; declining: number }
  >();

  for (const stock of stocks) {
    const entry = sectorMap.get(stock.sector) ?? {
      count: 0,
      changeSum: 0,
      advancing: 0,
      declining: 0,
    };
    entry.count += 1;
    entry.changeSum += stock.change;
    if (stock.change > 0) entry.advancing += 1;
    else if (stock.change < 0) entry.declining += 1;
    sectorMap.set(stock.sector, entry);
  }

  const sectors = [...sectorMap.entries()]
    .map(([sector, data]) => ({
      sector,
      count: data.count,
      avgChange: data.changeSum / data.count,
      advancing: data.advancing,
      declining: data.declining,
    }))
    .sort((a, b) => b.avgChange - a.avgChange);

  return (
    <section className="sector-perf-section">
      <div className="section-title">SECTOR PERFORMANCE</div>

      <div className="sector-perf-grid">
        {sectors.map((item) => (
          <div className="sector-perf-card" key={item.sector}>
            <div className="sector-perf-head">
              <strong>{item.sector}</strong>
              <span
                className={
                  item.avgChange > 0 ? "green" : item.avgChange < 0 ? "red" : ""
                }
              >
                {item.avgChange > 0 ? "▲" : item.avgChange < 0 ? "▼" : "—"}{" "}
                {Math.abs(item.avgChange).toFixed(2)}%
              </span>
            </div>

            <div className="sector-perf-stats">
              <div>
                <span>STOCKS</span>
                <strong>{item.count}</strong>
              </div>
              <div>
                <span>ADV</span>
                <strong className="green">{item.advancing}</strong>
              </div>
              <div>
                <span>DEC</span>
                <strong className="red">{item.declining}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
