import { createFileRoute, Link } from "@tanstack/react-router";
import { MatchBadge } from "@/components/status";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { getInspectionQueueFn } from "@/fns/matches";
import { fmtDate, fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/technician")({
  loader: () => getInspectionQueueFn(),
  head: () => ({ meta: [{ title: "Inspections — ReJenga" }] }),
  component: Queue,
});

const decisionTone = { accepted: "text-success", rejected: "text-muted-foreground", unsafe: "text-destructive" } as const;

function Queue() {
  const { waiting, recent } = Route.useLoaderData();
  return (
    <>
      <PageHeader tag="Technician" title="Inspection queue" />
      <h2 className="mb-3 text-lg font-bold">Waiting for a check ({waiting.length})</h2>
      {waiting.length === 0 ? (
        <Empty>No reserved parts are waiting for inspection.</Empty>
      ) : (
        <div className="grid gap-3">
          {waiting.map((m) => (
            <Link key={m.id} to="/matches/$id" params={{ id: String(m.id) }}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-5 hover:border-copper">
                <div>
                  <p className="font-display text-lg font-bold">{m.partName}: {m.donorModel} → {m.recipientModel}{m.isBattery && <span className="ml-2 align-middle text-xs font-semibold text-destructive">BATTERY — check for swelling</span>}</p>
                  <p className="text-sm text-muted-foreground">Donor {m.donorName} ({m.donorArea}) · recipient {m.recipientName} ({m.recipientArea}) · reserved {fmtDate(m.reservedAt)}, expires {fmtDate(m.expiresAt)}</p>
                </div>
                <MatchBadge status={m.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
      <h2 className="mb-3 mt-10 text-lg font-bold">Recent inspections</h2>
      {recent.length === 0 ? (
        <Empty>No inspections recorded yet.</Empty>
      ) : (
        <Card className="divide-y">
          {recent.map((r) => (
            <Link key={r.matchId} to="/matches/$id" params={{ id: String(r.matchId) }} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-muted/60">
              <span>{r.match?.partName}: {r.match?.donorModel} → {r.match?.recipientModel} <span className="text-muted-foreground">· {r.technicianName} · {fmtDateTime(r.inspectedAt)}</span></span>
              <span className={`font-semibold ${decisionTone[r.decision]}`}>{r.decision === "unsafe" ? "Blocked: unsafe" : r.decision === "accepted" ? "Accepted" : "Rejected"}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
