import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { InspectionBadge, PlainBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { getMyListingsFn } from "@/fns/listings";
import { fmtDate } from "@/lib/utils";
import { availabilityLabel, listingStatusLabel } from "@/lib/types";

export const Route = createFileRoute("/_app/listings/")({
  loader: () => getMyListingsFn(),
  head: () => ({ meta: [{ title: "My phones — ReJenga" }] }),
  component: MyListings,
});


function MyListings() {
  const rows = Route.useLoaderData();
  return (
    <>
      <PageHeader tag="Donor" title="My phones">
        <Button asChild variant="copper"><Link to="/listings/new"><Plus /> List a phone</Link></Button>
      </PageHeader>
      {rows.length === 0 ? (
        <Empty>You haven't listed a phone yet. An old phone with a broken screen can still give a working battery, camera or charging port.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((l) => (
            <Link key={l.id} to="/listings/$id" params={{ id: String(l.id) }}>
              <Card className="p-5 transition-colors hover:border-copper">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold">{l.model}</p>
                    <p className="text-sm text-muted-foreground">{l.area} · listed {fmtDate(l.createdAt)}</p>
                  </div>
                  <PlainBadge kind={l.status === "active" ? "info" : "off"}>{listingStatusLabel[l.status]}</PlainBadge>
                </div>
                <ul className="mt-4 grid gap-2">
                  {l.parts.map((p) => (
                    <li key={p.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{p.name} <span className="text-muted-foreground">· {availabilityLabel[p.availability]}</span></span>
                      <InspectionBadge status={p.inspectionStatus} />
                    </li>
                  ))}
                </ul>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
