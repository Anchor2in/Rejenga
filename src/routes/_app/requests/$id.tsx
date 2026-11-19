import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleHelp, MapPin } from "lucide-react";
import { ActionButton } from "@/components/confirm";
import { AiSuggestion, InspectionBadge, MatchBadge, RequestBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { cancelRequestFn, getRequestFn, reservePartFn } from "@/fns/requests";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/requests/$id")({
  loader: ({ params }) => getRequestFn({ data: Number(params.id) }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.request.part ?? "Request"} — ReJenga` }] }),
  component: RequestPage,
});

function RequestPage() {
  const { request, candidates, history, isOwner } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const reserve = useServerFn(reservePartFn);
  const cancel = useServerFn(cancelRequestFn);
  const openMatch = history.find((h) => h.status === "reserved" || h.status === "accepted");

  return (
    <>
      <PageHeader tag={`Request #${request.id}`} title={`${request.part} for ${request.model}`}>
        {isOwner && (request.status === "open" || request.status === "reserved") && (
          <ActionButton variant="outline" confirm="Cancel this request? Any reservation will be released." action={async () => { await cancel({ data: request.id }); await router.invalidate(); }}>
            Cancel request
          </ActionButton>
        )}
      </PageHeader>
      <Card className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 p-5 text-sm">
        <RequestBadge status={request.status} />
        <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="size-4" aria-hidden="true" /> {request.area}</span>
        <span className="text-muted-foreground">Created {fmtDate(request.createdAt)}</span>
        <p className="basis-full">{request.problem}</p>
      </Card>

      {openMatch && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-copper p-5">
          <div>
            <p className="font-semibold">You have a part reserved for this request.</p>
            <MatchBadge status={openMatch.status} />
          </div>
          <Button asChild><Link to="/matches/$id" params={{ id: String(openMatch.id) }}>Open reservation</Link></Button>
        </Card>
      )}

      {request.status === "open" && (
        <section aria-labelledby="matches-h">
          <h2 id="matches-h" className="mb-1 text-xl font-bold">Compatible parts ({candidates.length})</h2>
          <p className="mb-4 text-sm text-muted-foreground">Technician-checked parts are listed first, then the nearest. A catalogue match doesn't prove the part works. A technician still checks it after you reserve.</p>
          {candidates.length === 0 ? (
            <Empty>No compatible parts are available right now. We'll notify you when a matching phone is listed.</Empty>
          ) : (
            <div className="grid gap-4">
              {candidates.map((c, i) => (
                <Card key={c.listingPartId} className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="label-tag text-muted-foreground">#{i + 1}</span>
                      <p className="font-display text-lg font-bold">{c.partName} from {c.modelLabel}</p>
                      <InspectionBadge status={c.inspectionStatus} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{c.area} · about {c.distanceKm.toFixed(1)} km away</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="label-tag text-success">Why it matches</p>
                        <ul className="mt-1 grid gap-1 text-sm">
                          {c.reasons.map((r) => <li key={r} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />{r}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="label-tag text-warning">Not verified yet</p>
                        <ul className="mt-1 grid gap-1 text-sm">
                          {c.unverified.map((r) => <li key={r} className="flex gap-1.5"><CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />{r}</li>)}
                        </ul>
                      </div>
                    </div>
                    {c.photos.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {c.photos.slice(0, 2).map((p) => (
                          <div key={p.fileName} className="w-40">
                            <img src={`/photos/${p.fileName}`} alt={`${c.modelLabel} donor phone`} className="aspect-[4/3] w-full rounded-lg border object-cover" loading="lazy" />
                            <div className="mt-1"><AiSuggestion photo={p} compact /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {isOwner && (
                    <div className="md:self-center">
                      <ActionButton
                        variant="copper"
                        action={async () => {
                          const matchId = await reserve({ data: { requestId: request.id, listingPartId: c.listingPartId } });
                          await router.invalidate();
                          await navigate({ to: "/matches/$id", params: { id: String(matchId) } });
                        }}
                      >
                        Reserve this part
                      </ActionButton>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Reservation history</h2>
          <ul className="grid gap-2">
            {history.map((h) => (
              <li key={h.id}>
                <Link to="/matches/$id" params={{ id: String(h.id) }} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-3 text-sm hover:border-copper">
                  <span>Reservation #{h.id} · {fmtDate(h.reservedAt)}</span>
                  <MatchBadge status={h.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
