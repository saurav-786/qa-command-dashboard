import Link from "next/link";
import { getSuite } from "@/lib/store";
import { formatIst } from "@/lib/ist";
import { StatusChip } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function SuitePage({
  params,
}: {
  params: Promise<{ suite_key: string }>;
}) {
  const { suite_key } = await params;
  const data = await getSuite(decodeURIComponent(suite_key));
  return (
    <div className="mx-auto max-w-5xl p-6 text-text">
      <Link href="/" className="text-sm text-blue hover:underline">
        ← Back to command
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{data.suite.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {data.suite.runs_total} runs · pass rate {data.suite.pass_rate_30d}% · last{" "}
        <span title={data.suite.last_run_at || undefined}>
          {formatIst(data.suite.last_run_at)}
        </span>
      </p>
      <div className="mt-4 rounded border border-border bg-bg-panel p-4">
        <div className="text-xs uppercase text-muted">Usual starters</div>
        <ul className="mt-2 space-y-1 text-sm">
          {(data.starters as { name: string; kind: string; count: number }[]).map((s) => (
            <li key={`${s.name}-${s.kind}`}>
              {s.name} ({s.kind}) — {s.count}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 overflow-x-auto rounded border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-bg-elev text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Started IST</th>
              <th className="px-3 py-2 text-left">Starter</th>
              <th className="px-3 py-2 text-left">Result</th>
              <th className="px-3 py-2 text-left">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs" title={r.started_at || undefined}>
                  {formatIst(r.started_at)}
                </td>
                <td className="px-3 py-2">{r.started_by_name}</td>
                <td className="px-3 py-2">
                  <StatusChip status={r.status} />
                </td>
                <td className="px-3 py-2 text-muted">{r.verdict_raw || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
