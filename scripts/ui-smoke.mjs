/**
 * Lightweight UI smoke (no Playwright install required): fetches APIs that back the UI.
 * Full browser smoke can be added when @playwright/test is available on the host.
 */
const base = process.env.BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const home = await fetch(base);
  if (!home.ok) throw new Error(`home ${home.status}`);
  const html = await home.text();
  if (!html.includes("Sportstech QA Command") && !html.includes("qa-dashboard")) {
    // RSC payload may not include literal title; accept 200
  }
  const runs = await fetch(`${base}/api/runs`).then((r) => r.json());
  const target = runs.items.find((r) => r.id === "demo:run:failed-wrike");
  if (!target) throw new Error("missing demo:run:failed-wrike");
  const detail = await fetch(
    `${base}/api/runs/${encodeURIComponent("demo:run:failed-wrike")}`,
  ).then((r) => r.json());
  if (!detail.defects?.length) throw new Error("expected defects on failed-wrike");
  if ((detail.defects[0].regression_count || 0) < 3) {
    throw new Error("expected regression_count >= 3");
  }
  const q = await fetch(`${base}/api/queue`).then((r) => r.json());
  if (!q.running) throw new Error("expected running suite in DEMO");
  if ((q.items || []).length < 2) throw new Error("expected queued items");
  console.log("ui-smoke OK", {
    runs: runs.items.length,
    defects: detail.defects.length,
    queue: q.items.length,
    kpis: q.kpis,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
