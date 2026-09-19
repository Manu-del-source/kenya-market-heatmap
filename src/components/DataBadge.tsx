/**
 * Provenance labels.
 *
 * Every figure in the product carries one of these so a user can always tell
 * real market data from sample data. The platform never renders a number
 * without a visible indication of where it came from.
 */

import { DATA_MODE_LABEL, type DataMode } from "@/lib/types/market";

const CLASS_BY_MODE: Record<DataMode, string> = {
  live: "badge live",
  delayed: "badge delayed",
  "end-of-day": "badge eod",
  demo: "badge demo",
  unavailable: "badge unavailable",
};

export default function DataBadge({
  mode,
  label,
  title,
}: {
  mode: DataMode;
  label?: string;
  title?: string;
}) {
  return (
    <em className={CLASS_BY_MODE[mode]} title={title ?? `Data mode: ${DATA_MODE_LABEL[mode]}`}>
      {label ?? DATA_MODE_LABEL[mode].toUpperCase()}
    </em>
  );
}

/** Inline "—" for values the source did not report. */
export function NotAvailable({ note }: { note?: string }) {
  return (
    <span className="cell-muted" title={note ?? "Not reported by the data source"}>
      —
    </span>
  );
}
