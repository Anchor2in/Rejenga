import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { RequestBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { getMyRequestsFn } from "@/fns/requests";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/requests/")({
  loader: () => getMyRequestsFn(),
  head: () => ({ meta: [{ title: "My requests — ReJenga" }] }),
  component: MyRequests,
});

function MyRequests() {
  const rows = Route.useLoaderData();
  return (
    <>
      <PageHeader tag="Recipient" title="My part requests">
        <Button asChild variant="copper"><Link to="/requests/new"><Plus /> Request a part</Link></Button>
      </PageHeader>
      {rows.length === 0 ? (
        <Empty>No requests yet. Tell us your phone model and the part it needs, and we'll show compatible donor parts.</Empty>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Link key={r.id} to="/requests/$id" params={{ id: String(r.id) }}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-5 hover:border-copper">
                <div>
                  <p className="font-display text-lg font-bold">{r.part} for {r.model}</p>
                  <p className="text-sm text-muted-foreground">{r.area} · {fmtDate(r.createdAt)}</p>
                </div>
                <RequestBadge status={r.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
