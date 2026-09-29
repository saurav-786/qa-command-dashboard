import { eventsAfter, ensureReady } from "@/lib/store";
import { getDb } from "@/lib/db";
import { getPg, isPostgres } from "@/lib/db-pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  await ensureReady();
  const lastId = Number(req.headers.get("last-event-id") || "0");
  const encoder = new TextEncoder();
  const started = Date.now();
  const MAX_MS = 50_000;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown, id?: number) => {
        let chunk = "";
        if (id != null) chunk += `id: ${id}\n`;
        chunk += `event: ${event}\n`;
        chunk += `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      let cursor = lastId;
      if (!cursor) {
        if (isPostgres()) {
          const sql = getPg();
          const [row] = await sql<{ m: number }[]>`SELECT COALESCE(MAX(seq), 0)::int AS m FROM run_events`;
          cursor = row.m;
        } else {
          const row = getDb()
            .prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM run_events")
            .get() as { m: number };
          cursor = row.m;
        }
      }

      while (Date.now() - started < MAX_MS) {
        const rows = await eventsAfter(cursor, 50);
        for (const r of rows) {
          cursor = r.seq;
          const payload = (() => {
            try {
              return JSON.parse(r.payload);
            } catch {
              return {};
            }
          })();
          const name = r.type.startsWith("defect")
            ? "defect.updated"
            : r.type === "case.result"
              ? "case.result"
              : r.type.includes("queue")
                ? "queue.updated"
                : r.type.startsWith("wrike")
                  ? "wrike.updated"
                  : "run.updated";
          send(name, { ...r, payload }, r.seq);
        }
        send("heartbeat", { ts: new Date().toISOString() });
        await new Promise((r) => setTimeout(r, 1500));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
