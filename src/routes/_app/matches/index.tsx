import { createFileRoute, Link } from "@tanstack/react-router";
import { MatchBadge } from "@/components/status";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { getMyMatchesFn } from "@/fns/matches";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/matches/")({
  loader: () => getMyMatchesFn(),
  head: () => ({ meta: [{ title: "Matches — ReJenga" }] }),
  component: MyMatches,
});

function MyMatches() {
  const { user } = Route.useRouteContext();
  const rows = Route.useLoaderData();
  return (
    <>
      <PageHeader tag="Reservations" title="Matches" />
      {rows.length === 0 ? (
        <Empty>No reservations yet. Reserve a compatible part from one of your requests, or wait for someone to reserve a part you listed.</Empty>
      ) : (
        <div className="grid gap-3">
          {rows.map((m) => (
            <Link key={m.id} to="/matches/$id" params={{ id: String(m.id) }}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-5 hover:border-copper">
                <div>
                  <p className="label-tag text-copper">{m.donorId === user.id ? "You're giving" : "You're receiving"}</p>
                  <p className="font-display text-lg font-bold">{m.partName}: {m.donorModel} → {m.recipientModel}</p>
                  <p className="text-sm text-muted-foreground">Reserved {fmtDate(m.reservedAt)} · {m.donorId === user.id ? `for ${m.recipientName}` : `from ${m.donorName}`}</p>
                </div>
                <MatchBadge status={m.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
