import { NextRequest, NextResponse } from "next/server";
import { kpis, listRuns } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const data = await listRuns({
    status: sp.get("status") || undefined,
    suite: sp.get("suite") || undefined,
    starter: sp.get("starter") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    has_wrike: sp.get("has_wrike") || undefined,
    regression_only: sp.get("regression_only") || undefined,
    cursor: sp.get("cursor") || undefined,
  });
  return NextResponse.json({ ...data, kpis: await kpis() });
}
