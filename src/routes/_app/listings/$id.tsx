import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ActionButton } from "@/components/confirm";
import { PhotoPicker } from "@/components/photo-picker";
import { AiSuggestion, InspectionBadge, PlainBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { FormError } from "@/components/ui/form";
import { addPhotosFn, getListingFn, recheckPhotoFn, withdrawListingFn, withdrawPartFn } from "@/fns/listings";
import { availabilityLabel, donorConditionLabel, listingStatusLabel } from "@/lib/types";
import { errorMessage, fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/listings/$id")({
  loader: ({ params }) => getListingFn({ data: Number(params.id) }),
  head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.listing.model ?? "Listing"} — ReJenga` }] }),
  component: ListingPage,
});

function ListingPage() {
  const { listing, parts, photos, isOwner, maxPhotos } = Route.useLoaderData();
  const router = useRouter();
  const withdraw = useServerFn(withdrawListingFn);
  const withdrawPart = useServerFn(withdrawPartFn);
  const addPhotos = useServerFn(addPhotosFn);
  const recheck = useServerFn(recheckPhotoFn);
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const active = listing.status === "active";
  const refresh = () => router.invalidate();

  return (
    <>
      <PageHeader tag={`Listing #${listing.id}`} title={listing.model}>
        {isOwner && active && (
          <ActionButton variant="outline" confirm="Withdraw this phone? Any reservations on its parts will be cancelled." action={async () => { await withdraw({ data: listing.id }); await refresh(); }}>
            Withdraw listing
          </ActionButton>
        )}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <PlainBadge kind={active ? "info" : "off"}>{listingStatusLabel[listing.status]}</PlainBadge>
              <span>{listing.area}</span>·<span>listed {fmtDate(listing.createdAt)}</span>
              {!isOwner && <span>· donor {listing.donorName}</span>}
            </div>
            {listing.removedReason && <p className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-destructive">Removed: {listing.removedReason}</p>}
            <h2 className="mt-5 label-tag text-muted-foreground">Visible condition · from the donor, unverified</h2>
            <p className="mt-1 whitespace-pre-line">{listing.visibleCondition}</p>
            {listing.description && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{listing.description}</p>}
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-bold">Parts</h2>
            <ul className="mt-4 divide-y">
              {parts.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Donor says: {donorConditionLabel[p.donorCondition]}{p.donorNotes ? ` — ${p.donorNotes}` : ""} · {availabilityLabel[p.availability]}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <InspectionBadge status={p.inspectionStatus} />
                    {p.openMatchId && <Button asChild size="sm" variant="secondary"><Link to="/matches/$id" params={{ id: String(p.openMatchId) }}>View reservation</Link></Button>}
                    {isOwner && p.availability === "available" && (
                      <ActionButton size="sm" variant="ghost" confirm={`Stop offering the ${p.name.toLowerCase()}?`} action={async () => { await withdrawPart({ data: p.id }); await refresh(); }}>
                        Withdraw part
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="grid content-start gap-4 p-6">
          <h2 className="text-lg font-bold">Photos</h2>
          {photos.length === 0 && <p className="text-sm text-muted-foreground">No photos yet.</p>}
          {photos.map((ph) => (
            <figure key={ph.id} className="grid gap-2">
              <img src={`/photos/${ph.fileName}`} alt={`${listing.model} photo`} className="aspect-[4/3] w-full rounded-lg border object-cover" loading="lazy" />
              <AiSuggestion photo={ph} />
              {isOwner && (ph.aiStatus === "failed" || ph.aiStatus === "done") && (
                <button className="justify-self-start text-xs text-primary underline" onClick={async () => { await recheck({ data: ph.id }); await refresh(); }}>Run AI check again</button>
              )}
            </figure>
          ))}
          {photos.some((p) => p.aiStatus === "pending") && <Button size="sm" variant="outline" onClick={refresh}>Refresh AI results</Button>}
          {isOwner && active && photos.length < maxPhotos && (
            <div className="grid gap-3 border-t pt-4">
              <PhotoPicker files={newPhotos} onChange={setNewPhotos} max={maxPhotos - photos.length} />
              <FormError error={photoError} />
              {newPhotos.length > 0 && (
                <Button
                  onClick={async () => {
                    const fd = new FormData();
                    fd.set("listingId", String(listing.id));
                    newPhotos.forEach((f) => fd.append("photos", f));
                    try {
                      setPhotoError(null);
                      await addPhotos({ data: fd });
                      setNewPhotos([]);
                      await refresh();
                    } catch (e) {
                      setPhotoError(errorMessage(e));
                    }
                  }}
                >
                  Upload {newPhotos.length} photo{newPhotos.length > 1 ? "s" : ""}
                </Button>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
