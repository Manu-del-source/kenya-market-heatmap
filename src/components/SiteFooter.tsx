import type { MarketDataMeta } from "@/lib/types/market";
import { formatDateTime } from "@/lib/format";

export default function SiteFooter({ meta }: { meta?: MarketDataMeta }) {
  return (
    <footer className="site-footer">
      <div>
        <p>
          KENYA MARKET INTELLIGENCE — market data, sector analytics and economic
          indicators for companies traded on the Nairobi Securities Exchange.
        </p>
        <p>
          {meta
            ? `Source: ${meta.providerName} · ${meta.attribution} · Retrieved ${formatDateTime(meta.asOf)}`
            : "Source information is shown alongside every dataset."}
        </p>
      </div>

      <div>
        <p>
          Not investment advice. Nothing on this site is a recommendation to buy
          or sell any security.
        </p>
        <p>
          NSE market data is licensed; redistribution requires permission from
          the Nairobi Securities Exchange.
        </p>
      </div>
    </footer>
  );
}
