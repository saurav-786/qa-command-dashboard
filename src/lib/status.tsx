import {
  CheckCircle2,
  XCircle,
  Loader2,
  PauseCircle,
  Ban,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import type { RunStatus } from "./types";

const map: Record<
  RunStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  passed: {
    label: "Passed",
    className: "bg-[#16a34a] text-white border-transparent",
    Icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    className: "bg-[#dc2626] text-white border-transparent",
    Icon: XCircle,
  },
  running: {
    label: "Running",
    className: "bg-[#15803d] text-white border-transparent",
    Icon: Loader2,
  },
  queued: {
    label: "Queued",
    className: "bg-[#2563eb] text-white border-transparent",
    Icon: Clock3,
  },
  flaky: {
    label: "Flaky",
    className: "bg-[#d97706] text-white border-transparent",
    Icon: AlertTriangle,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-[#4b5563] text-white border-transparent",
    Icon: Ban,
  },
  held: {
    label: "Held",
    className: "bg-[#b45309] text-white border-transparent",
    Icon: PauseCircle,
  },
};

export function StatusChip({ status }: { status: RunStatus | string }) {
  const conf = map[status as RunStatus] || map.queued;
  const Icon = conf.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${conf.className}`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${status === "running" ? "animate-spin" : ""}`}
        aria-hidden
      />
      <span className="sr-only">Status: </span>
      {conf.label}
    </span>
  );
}
