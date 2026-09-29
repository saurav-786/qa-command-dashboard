"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bug,
  CalendarDays,
  Clock3,
  Cuboid,
  ExternalLink,
  FileText,
  History,
  Layers,
  Link2,
  Play,
  RefreshCw,
  Radio,
  X,
} from "lucide-react";
import type { Defect, QueueItem, SuiteRun } from "@/lib/types";
import { StatusChip } from "@/lib/status";
import { clockIst, durationMs, formatDuration, formatIst } from "@/lib/ist";

type Conn = "live" | "reconnecting" | "polling";

type Kpis = {
  running: number;
  queue: number;
  openDefects: number;
  regressions7d: number;
};

export function CommandConsole({
  demoMode,
  initialRuns,
  initialQueue,
  initialRunning,
  initialKpis,
}: {
  demoMode: boolean;
  initialRuns: SuiteRun[];
  initialQueue: QueueItem[];
  initialRunning: SuiteRun | null;
  initialKpis: Kpis;
}) {
  const [runs, setRuns] = useState(initialRuns);
  const [queue, setQueue] = useState(initialQueue);
  const [running, setRunning] = useState(initialRunning);
  const [kpis, setKpis] = useState(initialKpis);
  const [conn, setConn] = useState<Conn>("live");
  const [clock, setClock] = useState(clockIst());
  const [tick, setTick] = useState(0);
  const [suiteFilter, setSuiteFilter] = useState("");
  const [starterFilter, setStarterFilter] = useState("");
  const [drawer, setDrawer] = useState<{
    run: SuiteRun;
    defects: Defect[];
  } | null>(null);
  const [nav, setNav] = useState<"live" | "queue" | "history" | "defects" | "wrike">(
    "live",
  );

  useEffect(() => {
    const t = setInterval(() => {
      setClock(clockIst());
      setTick((x) => x + 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let fails = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      const [q, r] = await Promise.all([
        fetch("/api/queue").then((x) => x.json()),
        fetch(
          `/api/runs?${new URLSearchParams({
            ...(suiteFilter ? { suite: suiteFilter } : {}),
            ...(starterFilter ? { starter: starterFilter } : {}),
          })}`,
        ).then((x) => x.json()),
      ]);
      setQueue(q.items || []);
      setRunning(q.running || null);
      if (q.kpis) setKpis(q.kpis);
      setRuns(r.items || []);
      if (r.kpis) setKpis(r.kpis);
    };

    const startPoll = () => {
      setConn("polling");
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(refresh, 5000);
    };

    const startEs = () => {
      es = new EventSource("/api/stream");
      es.onopen = () => {
        fails = 0;
        setConn("live");
      };
      es.onerror = () => {
        fails += 1;
        setConn("reconnecting");
        es?.close();
        if (fails >= 2) startPoll();
        else setTimeout(startEs, 3000);
      };
      const onUpdate = () => {
        void refresh();
      };
      es.addEventListener("run.updated", onUpdate);
      es.addEventListener("queue.updated", onUpdate);
      es.addEventListener("defect.updated", onUpdate);
      es.addEventListener("heartbeat", () => setConn("live"));
    };

    startEs();
    return () => {
      es?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [suiteFilter, starterFilter]);

  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (!demoMode) return;
    const t = setInterval(async () => {
      const current = runningRef.current;
      if (!current) return;
      const pct = Math.min(95, (current.progress_pct || 50) + 1);
      const body = JSON.stringify({
        event_id: `demo-sim-${Date.now()}`,
        type: "suite.progress",
        ts: new Date().toISOString(),
        run_id: current.id,
        seq: 0,
        payload: { pct, current_case: current.current_case || "case" },
      });
      const ts = String(Date.now());
      const secret = "demo-ingest-secret";
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
      const signature = [...new Uint8Array(sigBuf)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-QA-Timestamp": ts,
          "X-QA-Signature": signature,
        },
        body,
      });
    }, 8000);
    return () => clearInterval(t);
  }, [demoMode]);

  const elapsed = useMemo(() => {
    void tick;
    return formatDuration(durationMs(running?.started_at, null));
  }, [running, tick]);

  const openRun = async (run: SuiteRun) => {
    const data = await fetch(`/api/runs/${encodeURIComponent(run.id)}`).then((r) =>
      r.json(),
    );
    setDrawer({ run, defects: data.defects || [] });
  };

  const history = runs.filter((r) => r.status !== "running" && r.status !== "queued");

  return (
    <div className="flex min-h-screen bg-[#0a0c10] text-[#e8edf5]">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#232a36] bg-[#0e1218]">
        <div className="flex items-center gap-2.5 border-b border-[#232a36] px-4 py-4">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-[#ef4444] to-[#991b1b] shadow-[0_0_20px_rgba(239,68,68,0.35)]">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-wide">Sportstech</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#7d8798]">
              QA Command
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2.5 text-[13px]">
          {(
            [
              ["live", "Live", Radio],
              ["queue", "Queue", Clock3],
              ["history", "History", History],
              ["defects", "Defects", Bug],
              ["wrike", "Wrike", Link2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setNav(id)}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition ${
                nav === id
                  ? "bg-[#12261a] text-[#4ade80] shadow-[inset_3px_0_0_#22c55e]"
                  : "text-[#8b95a8] hover:bg-white/[0.03] hover:text-[#e8edf5]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <Link
            href="/suites/agent-qa-pdp-cart"
            className="flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[#8b95a8] hover:bg-white/[0.03] hover:text-[#e8edf5]"
          >
            <Layers className="h-4 w-4" />
            Suites
          </Link>
        </nav>
        <div className="border-t border-[#232a36] p-3 text-[10px] leading-relaxed text-[#6b7384]">
          <div>Sportstech QA Command · v2.4.1</div>
          <div>© 2026 Sportstech Fitness GmbH</div>
          <div className="mt-1 text-[#4b5563]">Generated by QA Automation Bot</div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[#232a36] bg-[#0e1218]/80 px-6 py-3 backdrop-blur">
          <h1 className="text-[17px] font-semibold tracking-tight">Sportstech QA Command</h1>
          <div className="flex items-center gap-3 text-sm">
            {demoMode && (
              <span className="rounded border border-[#f59e0b]/60 bg-[#f59e0b]/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#fbbf24]">
                DEMO DATA
              </span>
            )}
            <span className="font-mono text-[13px] text-[#8b95a8]">IST {clock}</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#22c55e]/40 bg-[#14532d]/40 px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#4ade80]">
              <span className="live-dot h-2 w-2 rounded-full bg-[#22c55e]" />
              LIVE
              <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
                {[8, 12, 7, 14].map((h, i) => (
                  <span
                    key={i}
                    className="hb-bar w-[2px] rounded-sm bg-[#22c55e]"
                    style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </span>
            </span>
            <span className="text-[11px] text-[#6b7384]">{conn}</span>
          </div>
        </header>

        <div className="space-y-4 p-5">
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Running" value={kpis.running} tone="green" icon={<Play className="h-4 w-4" />} />
            <Kpi label="Queue" value={kpis.queue} tone="blue" icon={<Clock3 className="h-4 w-4" />} />
            <Kpi label="Open defects" value={kpis.openDefects} tone="red" icon={<Bug className="h-4 w-4" />} />
            <Kpi
              label="Regressions 7d"
              value={kpis.regressions7d}
              tone="orange"
              icon={<RefreshCw className="h-4 w-4" />}
            />
          </section>

          <section className="grid gap-3 xl:grid-cols-[1.45fr_1fr]">
            <div className="rounded-xl border border-[#2a313c] bg-[#12171f] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8b95a8]">
                <span className="live-dot h-2 w-2 rounded-full bg-[#22c55e]" />
                Current execution
              </div>
              {running ? (
                <>
                  <div className="mb-4 flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-[#14532d]/50 p-2 text-[#4ade80]">
                      <Cuboid className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-[#4ade80]">
                        {running.suite_name}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] text-[#8b95a8] sm:grid-cols-3">
                        <div>
                          Started by:{" "}
                          <span className="text-[#e8edf5]">{running.started_by_name || "—"}</span>
                        </div>
                        <div>
                          Environment:{" "}
                          <span className="font-medium text-[#c4b5fd]">
                            {running.env || "unknown"}
                          </span>
                        </div>
                        <div>
                          Branch:{" "}
                          <span className="font-mono text-[#38bdf8]">
                            {running.branch || "—"} @ {running.git_sha || "unknown"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <ProgressBar run={running} />
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#232a36] pt-3 text-[12px] text-[#8b95a8]">
                    <span>
                      Elapsed <span className="font-mono text-[#e8edf5]">{elapsed}</span>
                    </span>
                    <span>
                      Current case:{" "}
                      <span className="text-[#e8edf5]">
                        {running.current_case || "progress unknown"}
                      </span>
                    </span>
                    {running.progress_pct == null && (
                      <span className="text-[#fbbf24]">progress unknown</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-10 text-center text-sm text-[#8b95a8]">
                  Idle — no suite running
                  <div className="mt-1 text-xs text-[#6b7384]">Waiting for watcher / CI / manual</div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#2a313c] bg-[#12171f] p-4">
              <div className="mb-3 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-[#8b95a8]">
                <span>Queue</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono normal-case tracking-normal text-[#e8edf5]">
                  {queue.length} items
                </span>
              </div>
              <ul className="space-y-2">
                {queue.map((q) => (
                  <li
                    key={q.id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-[#2a313c] bg-[#0e1218] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{q.suite_name}</div>
                      <div className="mt-0.5 text-[11px] text-[#8b95a8]">
                        Queued by {q.requested_by_name || "—"}
                        {q.scheduled_for ? ` · ETA ${formatIst(q.scheduled_for)}` : ""}
                      </div>
                    </div>
                    <PriorityBadge priority={q.priority} kind={q.requested_by_kind} />
                  </li>
                ))}
                {!queue.length && (
                  <li className="py-8 text-center text-sm text-[#8b95a8]">Queue empty</li>
                )}
              </ul>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-[#2a313c] bg-[#12171f]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232a36] px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <CalendarDays className="h-4 w-4 text-[#8b95a8]" />
                Execution history
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <input
                  value={suiteFilter}
                  onChange={(e) => setSuiteFilter(e.target.value)}
                  placeholder="Filter suite"
                  className="rounded-md border border-[#2a313c] bg-[#0e1218] px-2.5 py-1.5 text-[#e8edf5] outline-none focus:border-[#38bdf8]/50"
                />
                <input
                  value={starterFilter}
                  onChange={(e) => setStarterFilter(e.target.value)}
                  placeholder="Filter starter"
                  className="rounded-md border border-[#2a313c] bg-[#0e1218] px-2.5 py-1.5 text-[#e8edf5] outline-none focus:border-[#38bdf8]/50"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="bg-[#0e1218] text-[10px] uppercase tracking-wider text-[#7d8798]">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Suite</th>
                    <th className="px-3 py-2.5 font-semibold">Started by</th>
                    <th className="px-3 py-2.5 font-semibold">Started IST</th>
                    <th className="px-3 py-2.5 font-semibold">Duration</th>
                    <th className="px-3 py-2.5 font-semibold">Result</th>
                    <th className="px-3 py-2.5 font-semibold">Defects</th>
                    <th className="px-3 py-2.5 font-semibold">Wrike</th>
                    <th className="px-3 py-2.5 font-semibold">Regressions</th>
                    <th className="px-3 py-2.5 font-semibold">Went live</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr
                      key={run.id}
                      data-testid={`run-row-${run.id}`}
                      tabIndex={0}
                      className="cursor-pointer border-t border-[#232a36]/80 transition hover:bg-white/[0.025] focus:bg-white/[0.05] focus:outline-none"
                      onClick={() => void openRun(run)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void openRun(run);
                      }}
                    >
                      <td className="px-3 py-3 font-medium">{run.suite_name}</td>
                      <td className="px-3 py-3 text-[#8b95a8]">{run.started_by_name || "—"}</td>
                      <td
                        className="px-3 py-3 font-mono text-[11px] text-[#c5ccd8]"
                        title={run.started_at || undefined}
                      >
                        {formatIst(run.started_at)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px]">
                        {formatDuration(durationMs(run.started_at, run.finished_at))}
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip status={run.status} />
                      </td>
                      <td className="px-3 py-3">
                        {(run.defect_count || 0) > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-[#f87171]">
                            <Bug className="h-3.5 w-3.5" />
                            {run.defect_count}
                          </span>
                        ) : (
                          <span className="text-[#6b7384]">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {run.wrike_task_url ? (
                          <a
                            className="font-medium text-[#38bdf8] hover:underline"
                            href={run.wrike_task_url}
                            onClick={(e) => e.stopPropagation()}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WRK-{run.wrike_task_id}
                          </a>
                        ) : run.status === "failed" ? (
                          <span
                            className="rounded border border-[#f59e0b]/40 px-1.5 py-0.5 text-[10px] font-semibold text-[#fbbf24]"
                            title={run.unfiled_reason || "unfiled"}
                          >
                            unfiled
                          </span>
                        ) : (
                          <span className="text-[#6b7384]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {(run.regression_max || 0) > 1 ? (
                          <span className="rounded-md border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#fbbf24]">
                            Regression {run.regression_max}
                          </span>
                        ) : run.fixed_by_name ? (
                          <span className="rounded-md border border-[#22c55e]/40 bg-[#22c55e]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#4ade80]">
                            Fixed by {run.fixed_by_name}
                          </span>
                        ) : (
                          <span className="rounded-md border border-[#22c55e]/30 px-1.5 py-0.5 text-[10px] font-semibold text-[#4ade80]">
                            None 0
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-3 font-mono text-[11px] text-[#8b95a8]"
                        title={run.went_live_at || undefined}
                      >
                        {formatIst(run.went_live_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>

      {drawer && (
        <DefectDrawer
          run={drawer.run}
          defects={drawer.defects}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "green" | "blue" | "red" | "orange";
}) {
  const tones = {
    green: "text-[#4ade80]",
    blue: "text-[#38bdf8]",
    red: "text-[#f87171]",
    orange: "text-[#fbbf24]",
  };
  return (
    <div className="rounded-xl border border-[#2a313c] bg-[#12171f] px-4 py-3.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[#8b95a8]">
        {label}
        <span className={tones[tone]}>{icon}</span>
      </div>
      <div className="mt-1 text-[32px] font-semibold leading-none tracking-tight">{value}</div>
    </div>
  );
}

function ProgressBar({ run }: { run: SuiteRun }) {
  const total = run.totals_passed + run.totals_failed + run.totals_skipped || 1;
  const passShare = run.totals_passed / total;
  const failShare = run.totals_failed / total;
  const pct = run.progress_pct ?? 0;
  const passW = pct * passShare;
  const failW = pct * failShare;
  const restW = Math.max(0, pct - passW - failW);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="text-[#8b95a8]">Progress</span>
        <span className="font-mono text-[#e8edf5]">
          {run.progress_pct == null ? "unknown" : `${Math.round(run.progress_pct)}%`}
        </span>
      </div>
      <div className="progress-live flex h-3 overflow-hidden rounded-full bg-black/50">
        <div className="bg-[#22c55e]" style={{ width: `${passW}%` }} />
        <div className="bg-[#ef4444]" style={{ width: `${failW}%` }} />
        <div className="bg-white/25" style={{ width: `${restW}%` }} />
      </div>
      <div className="mt-2 flex gap-4 text-[12px]">
        <span className="text-[#4ade80]">{run.totals_passed} passed</span>
        <span className="text-[#f87171]">{run.totals_failed} failed</span>
        <span className="text-[#8b95a8]">{run.totals_skipped} skipped</span>
      </div>
    </div>
  );
}

function PriorityBadge({
  priority,
  kind,
}: {
  priority: number;
  kind: string | null;
}) {
  if (kind === "manual") {
    return (
      <span className="rounded bg-[#374151] px-1.5 py-0.5 text-[10px] font-bold text-[#d1d5db]">
        Manual
      </span>
    );
  }
  if (priority >= 10) {
    return (
      <span className="rounded bg-[#dc2626] px-1.5 py-0.5 text-[10px] font-bold text-white">
        P1
      </span>
    );
  }
  if (priority >= 5) {
    return (
      <span className="rounded bg-[#7c3aed] px-1.5 py-0.5 text-[10px] font-bold text-white">
        P2
      </span>
    );
  }
  return (
    <span className="rounded bg-[#374151] px-1.5 py-0.5 text-[10px] text-[#d1d5db]">P3</span>
  );
}

function DefectDrawer({
  run,
  defects,
  onClose,
}: {
  run: SuiteRun;
  defects: Defect[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = defects[0];
  const wrike = d?.wrike?.find((w) => w.wrike_id) || d?.wrike?.[0];

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-[#2a313c] bg-[#0e1218] shadow-[-20px_0_60px_rgba(0,0,0,0.45)]"
      role="dialog"
      aria-label="Defect detail"
    >
      <div className="flex items-center justify-between border-b border-[#232a36] px-4 py-3">
        <div className="text-[12px] font-bold tracking-[0.08em] text-[#e8edf5]">
          DEFECT · {wrike?.wrike_id ? `WRK-${wrike.wrike_id}` : "UNFILED"}
        </div>
        <div className="flex items-center gap-2">
          {wrike?.wrike_permalink && (
            <a
              href={wrike.wrike_permalink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[#2a313c] px-2 py-1 text-[11px] text-[#38bdf8]"
            >
              Open in Wrike <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#8b95a8] hover:bg-white/5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
        <div className="rounded-lg border border-[#2a313c] bg-[#12171f] p-3 text-[12px]">
          <div className="font-semibold">{run.suite_name}</div>
          <div className="mt-1 text-[#8b95a8]">
            <StatusChip status={run.status} />
            <span className="ml-2" title={run.started_at || undefined}>
              {formatIst(run.started_at)}
            </span>
          </div>
          {run.verdict_raw && (
            <div className="mt-2 text-[#c5ccd8]">{run.verdict_raw}</div>
          )}
          {run.status_reason && (
            <div className="mt-1 text-[#fbbf24]">{run.status_reason}</div>
          )}
        </div>
        {!d && (
          <p className="text-[#8b95a8]">
            No filed defects on this run
            {run.totals_failed ? ` (${run.totals_failed} failed checks — not yet filed)` : ""}.
          </p>
        )}
        {d && (
          <>
            <div className="flex gap-2.5">
              <Bug className="mt-0.5 h-4 w-4 shrink-0 text-[#f87171]" />
              <p className="leading-relaxed">{d.title}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#7d8798]">Area</div>
                <div className="mt-1 inline-block rounded-full bg-white/5 px-2 py-1">
                  {d.area || "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#7d8798]">Severity</div>
                <div className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-bold text-white">
                  {d.severity || "—"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-wide text-[#7d8798]">
                  Found in suite
                </div>
                <div className="mt-1">
                  {run.suite_name}
                  <div className="text-[11px] text-[#8b95a8]">
                    Started by {run.started_by_name || "—"} ·{" "}
                    <span title={run.started_at || undefined}>{formatIst(run.started_at)}</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#7d8798]">Who fixed</div>
                <div className="mt-1 font-medium">{d.fixed_by_name || "—"}</div>
                <div className="font-mono text-[10px] text-[#8b95a8]" title={d.fixed_at || undefined}>
                  {formatIst(d.fixed_at)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[#7d8798]">Went live</div>
                <div className="mt-1 font-mono text-[11px]" title={d.went_live_at || undefined}>
                  {formatIst(d.went_live_at)}
                </div>
                {d.release_id && (
                  <div className="mt-1 inline-block rounded bg-white/5 px-2 py-0.5 text-[10px] text-[#c5ccd8]">
                    {d.release_id}
                  </div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-[#7d8798]">
                Expected vs actual
              </div>
              <div className="space-y-1 rounded-lg border border-[#2a313c] bg-[#0a0c10] p-3 text-[12px]">
                <div>
                  <span className="text-[#8b95a8]">expected:</span> {d.expected || "—"}
                </div>
                <div>
                  <span className="text-[#8b95a8]">actual:</span> {d.actual || "—"}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-[#7d8798]">
                Regressions
                <span className="rounded bg-[#dc2626]/20 px-1.5 py-0.5 text-[11px] font-bold normal-case tracking-normal text-[#f87171]">
                  x{d.regression_count}
                </span>
              </div>
              <div className="flex gap-3 overflow-x-auto py-1">
                {(d.regression?.last || []).map((o, idx) => (
                  <div key={`${o.run_id}-${o.seen_at}`} className="flex flex-col items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444] shadow-[0_0_10px_rgba(239,68,68,0.9)]" />
                    {idx < (d.regression?.last.length || 1) - 1 && (
                      <span className="sr-only">then</span>
                    )}
                    <span className="whitespace-nowrap font-mono text-[9px] text-[#8b95a8]">
                      {formatIst(o.seen_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#7d8798]">Wrike status</div>
              <div className="mt-1">
                {wrike?.unfiled_reason ? (
                  <span className="text-[#fbbf24]">unfiled — {wrike.unfiled_reason}</span>
                ) : (
                  <StatusChip
                    status={
                      wrike?.wrike_status === "done"
                        ? "passed"
                        : wrike?.wrike_status === "in_progress"
                          ? "running"
                          : "queued"
                    }
                  />
                )}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-[#7d8798]">
                Evidence
              </div>
              <ul className="space-y-1.5 text-[12px]">
                {d.evidence_urls.map((u) => (
                  <li key={u}>
                    <a
                      className="inline-flex items-center gap-1.5 text-[#38bdf8] hover:underline"
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {u.replace(/^https?:\/\//, "").slice(0, 48)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
