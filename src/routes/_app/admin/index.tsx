import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Card, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { getReportFn } from "@/fns/admin";

export const Route = createFileRoute("/_app/admin/")({
  validateSearch: z.object({ days: z.coerce.number().int().min(1).max(3650).optional() }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ deps }) => getReportFn({ data: { days: deps.days } }),
  head: () => ({ meta: [{ title: "Reports — ReJenga" }] }),
  component: Reports,
});

function Bars({ title, data, labels }: { title: string; data: Record<string, number>; labels: Record<string, string> }) {
  const max = Math.max(1, ...Object.values(data));
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">{title}</h2>
        <span className="font-display text-2xl font-bold">{total}</span>
      </div>
      <ul className="mt-4 grid gap-2">
        {Object.entries(labels).map(([k, label]) => (
          <li key={k} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate text-muted-foreground">{label}</span>
            <span className="h-2.5 rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${((data[k] ?? 0) / max) * 100}%` }} /></span>
            <span className="text-right font-mono">{data[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Reports() {
  const r = Route.useLoaderData();
  const navigate = useNavigate({ from: Route.fullPath });
  const partsBy = (key: string) => Object.entries(r.parts).filter(([k]) => k.startsWith(key)).reduce((a, [, n]) => a + n, 0);
  const users = (role: string) => Object.entries(r.users).filter(([k]) => k.startsWith(role)).reduce((a, [, n]) => a + n, 0);
  return (
    <>
      <PageHeader tag="Administrator" title="Activity report">
        <Select aria-label="Period" value={r.days} onChange={(e) => navigate({ search: { days: Number(e.target.value) } })} className="w-40">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </Select>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Community members", users("community:")],
          ["Technicians", users("technician:")],
          ["Parts checked (all time)", partsBy("checked:")],
          ["Parts blocked unsafe (all time)", partsBy("blocked_unsafe:")],
        ].map(([l, v]) => (
          <Card key={l} className="p-5"><p className="font-display text-3xl font-bold">{v}</p><p className="text-sm text-muted-foreground">{l}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="New listings" data={r.listings} labels={{ active: "Active", withdrawn: "Withdrawn", removed: "Removed", closed: "Closed" }} />
        <Bars title="New requests" data={r.requests} labels={{ open: "Open", reserved: "Reserved", fulfilled: "Fulfilled", cancelled: "Cancelled" }} />
        <Bars title="Reservations" data={r.matches} labels={{ reserved: "Waiting check", accepted: "Accepted", completed: "Handed over", declined: "Declined", rejected: "Rejected", blocked_unsafe: "Blocked unsafe", cancelled: "Cancelled", expired: "Expired" }} />
        <Bars title="Inspections" data={r.inspections} labels={{ accepted: "Accepted", rejected: "Rejected", unsafe: "Unsafe" }} />
        <Bars title="AI photo checks" data={r.ai} labels={{ done: "Done", lowConfidence: "Low confidence", failed: "Failed", pending: "Pending", disabled: "Disabled" }} />
        <Card className="p-5">
          <h2 className="font-bold">Most requested</h2>
          {r.topRequested.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No requests in this period.</p> : (
            <ol className="mt-3 grid gap-1.5 text-sm">
              {r.topRequested.map((t) => <li key={t.model + t.part} className="flex justify-between gap-2"><span>{t.part} · {t.model}</span><span className="font-mono">{t.n}</span></li>)}
            </ol>
          )}
        </Card>
      </div>
      <Card className="mt-4 overflow-x-auto p-5">
        <h2 className="font-bold">Activity by area</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted-foreground"><tr><th className="py-1.5 font-medium">Area</th><th className="font-medium">Listings</th><th className="font-medium">Requests</th></tr></thead>
          <tbody className="divide-y">{r.byArea.map((a) => <tr key={a.area}><td className="py-1.5">{a.area}</td><td className="font-mono">{a.listings}</td><td className="font-mono">{a.requests}</td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}
