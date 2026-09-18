import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kenya Market Intelligence",
  description: "NSE market heatmap and market data dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
