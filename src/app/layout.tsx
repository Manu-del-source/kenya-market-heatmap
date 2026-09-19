import type { Metadata } from "next";
import "./globals.css";
import { SITE_NAME, absoluteUrl, buildMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...buildMetadata({
    title: "NSE market heatmap, sector and economic intelligence",
    description:
      "Kenya Market Intelligence — market heatmap, listed company data, sector performance, market breadth and Kenyan economic indicators for the Nairobi Securities Exchange.",
    path: "/",
  }),
  metadataBase: new URL(absoluteUrl("/")),
  title: {
    default: `${SITE_NAME} — NSE market data and analytics`,
    template: `%s | ${SITE_NAME}`,
  },
  applicationName: SITE_NAME,
  keywords: [
    "Nairobi Securities Exchange",
    "NSE Kenya",
    "Kenya stock market",
    "Safaricom SCOM",
    "KCB share price",
    "Equity Group",
    "NSE market heatmap",
    "Kenya economic indicators",
  ],
  authors: [{ name: SITE_NAME }],
  category: "Finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-KE">
      <body>
        <div className="site-shell">{children}</div>
      </body>
    </html>
  );
}
