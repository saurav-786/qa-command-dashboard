import { NextResponse } from "next/server";
import { getQueue, kpis } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ...(await getQueue()), kpis: await kpis() });
}
