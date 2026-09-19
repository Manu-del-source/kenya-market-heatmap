/**
 * Link-based sort control.
 *
 * Sorting lives in the URL rather than in component state so a sorted view can
 * be shared, bookmarked and crawled — and so the table itself stays a plain
 * server component with zero client JavaScript.
 */

import Link from "next/link";
import { SORT_OPTIONS, type SortId } from "./StockTable";

export function buildSortHref(basePath: string, params: Record<string, string | undefined>, sort: string) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  search.set("sort", sort);
  return `${basePath}?${search.toString()}`;
}

export default function SortBar({
  basePath,
  params,
  activeSort,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  activeSort: SortId;
}) {
  return (
    <div className="controls" aria-label="Sort companies">
      <div className="view-tabs" role="group" aria-label="Sort by">
        {SORT_OPTIONS.map((option) => (
          <Link
            key={option.id}
            href={buildSortHref(basePath, params, option.id)}
            className={option.id === activeSort ? "active" : ""}
            aria-current={option.id === activeSort ? "true" : undefined}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
