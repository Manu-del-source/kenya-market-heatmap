/**
 * Top-of-page provenance banner.
 *
 * States the provider, the data mode and the concrete limitations in plain
 * language. When sample data is in use this is unmissable.
 */

import type { MarketDataMeta } from "@/lib/types/market";
import { DATA_MODE_LABEL } from "@/lib/types/market";
import { formatDateTime } from "@/lib/format";

export default function DataBanner({ meta }: { meta: MarketDataMeta }) {
  const tone =
    meta.dataMode === "unavailable"
      ? "data-banner unavailable"
      : meta.dataMode === "demo"
        ? "data-banner"
        : "data-banner live";

  return (
    <section className={tone} aria-label="Data source and limitations">
      <strong>
        {meta.dataMode === "demo"
          ? "SAMPLE DATA — NOT LIVE MARKET DATA"
          : `${DATA_MODE_LABEL[meta.dataMode].toUpperCase()} · ${meta.providerName}`}
      </strong>

      <div>
        <p>
          {meta.dataMode === "demo"
            ? "Prices, volumes and capitalisations shown below are generated sample values for development and demonstration. They are not NSE prices and must not be used for any market or investment decision."
            : `${meta.attribution} Figures as of ${formatDateTime(meta.asOf)} (Nairobi time).`}
        </p>

        {meta.limitations.length > 0 && (
          <p>
            {meta.dataMode === "demo"
              ? ""
              : "Limitations: "}
            {meta.limitations.join(" ")}
          </p>
        )}
      </div>
    </section>
  );
}
