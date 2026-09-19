/**
 * GET /api/health
 *
 * Operability endpoint: which provider is active, which store is attached, and
 * whether a licensed feed is configured. Never exposes secrets — only whether
 * they are present.
 */

import { NextResponse } from "next/server";
import { config, isLicensedFeedConfigured, resolveProviderId } from "@/lib/config";
import { getRepository } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  const repository = await getRepository();
  const provider = getMarketDataProvider();

  return NextResponse.json(
    {
      status: "ok",
      provider: {
        id: provider.id,
        name: provider.name,
        dataMode: provider.dataMode,
        capabilities: provider.capabilities,
        selectedBy: config.marketDataProvider,
        effective: resolveProviderId(),
        licensedFeedConfigured: isLicensedFeedConfigured(),
        // Booleans only: never the values themselves.
        credentials: {
          apiBaseUrl: Boolean(config.nse.baseUrl),
          apiKey: Boolean(config.nse.apiKey),
        },
      },
      store: {
        kind: repository.kind,
        persistent: repository.isPersistent,
      },
      cache: {
        marketTtlSeconds: config.cache.marketTtlSeconds,
        disabled: config.disableCache,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
