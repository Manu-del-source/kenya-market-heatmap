/**
 * GET /api/sectors/[slug]
 *
 * Sector detail: aggregate plus every constituent with its quote — the data
 * behind the "sector → companies → stock" drill-down.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { parseSlug } from "@/lib/validation";
import { ValidationError } from "@/lib/validation";
import { buildMeta, getSectorDetail } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (_request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
    const { slug: raw } = await context.params;
    const slug = parseSlug(raw, "slug");

    const detail = await getSectorDetail(slug);
    if (!detail) {
      throw new ValidationError(`No sector found for "${slug}".`);
    }

    return jsonEnvelope(detail, buildMeta(), { sMaxAge: 60 });
  }
);
