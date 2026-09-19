"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "HEATMAP" },
  { href: "/stocks", label: "STOCKS" },
  { href: "/sectors", label: "SECTORS" },
  { href: "/compare", label: "COMPARE" },
  { href: "/economy", label: "ECONOMY" },
  { href: "/watchlist", label: "WATCHLIST" },
  { href: "/portfolio", label: "PORTFOLIO" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="Primary">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
