import { CommandConsole } from "@/components/CommandConsole";
import { isDemoMode } from "@/lib/db";
import { getQueue, kpis, listRuns } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { items } = await listRuns({ limit: 50 });
  const q = await getQueue();
  const k = await kpis();
  return (
    <CommandConsole
      demoMode={isDemoMode()}
      initialRuns={items}
      initialQueue={q.items}
      initialRunning={q.running}
      initialKpis={k}
    />
  );
}
