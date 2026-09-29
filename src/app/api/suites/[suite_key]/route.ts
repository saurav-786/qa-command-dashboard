import { NextResponse } from "next/server";
import { getSuite } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ suite_key: string }> },
) {
  const { suite_key } = await ctx.params;
  return NextResponse.json(await getSuite(decodeURIComponent(suite_key)));
}
