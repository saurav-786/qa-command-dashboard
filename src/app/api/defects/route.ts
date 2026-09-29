import { NextRequest, NextResponse } from "next/server";
import { listDefects } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return NextResponse.json(
    await listDefects({
      run_id: sp.get("run_id") || undefined,
      status: sp.get("status") || undefined,
      area: sp.get("area") || undefined,
    }),
  );
}
