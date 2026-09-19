/**
 * POST /api/cron/ingest
 *
 * Scheduled ingestion entry point (Vercel Cron → see vercel.json).
 *
 * Protected by `CRON_SECRET`. If no secret is configured the endpoint refuses
 * to run rather than exposing a public write path. The Vercel cron header
 * (`Authorization: Bearer $CRON_SECRET`) is also accepted.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { safeCompare } from "@/lib/api/route-helpers";
import { ingestAll, ingestMarketSnapshot } from "@/lib/services/ingestion-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : null;
  const query = new URL(request.url).searchParams.get("token");

  return safeCompare(bearer ?? "", secret) || safeCompare(query ?? "", secret);
}

async function handle(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json(
      {
        error: {
          code: "unauthorized",
          message: process.env.CRON_SECRET
            ? "Invalid or missing cron credentials."
            : "CRON_SECRET is not configured; scheduled ingestion is disabled.",
        },
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") === "history" ? "history" : "snapshot";

  try {
    const results = mode === "history" ? await ingestAll({ years: 5 }) : [await ingestMarketSnapshot()];
    const failed = results.some((result) => result.status === "failed");
    return NextResponse.json(
      { ok: !failed, results },
      { status: failed ? 502 : 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron] ingestion failed:", error);
    return NextResponse.json(
      { error: { code: "ingestion_failed", message: "Ingestion failed. See server logs." } },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const POST = handle;
export const GET = handle;
