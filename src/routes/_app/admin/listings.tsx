import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton } from "@/components/confirm";
import { PlainBadge } from "@/components/status";
import { Card, PageHeader } from "@/components/ui/card";
import { getAllListingsFn, removeListingFn } from "@/fns/admin";
import { listingStatusLabel } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/listings")({
  loader: () => getAllListingsFn(),
  head: () => ({ meta: [{ title: "Listings — ReJenga" }] }),
  component: Listings,
});

function Listings() {
  const rows = Route.useLoaderData();
  const remove = useServerFn(removeListingFn);
  const router = useRouter();
  return (
    <>
      <PageHeader tag="Administrator" title="All listings" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>{["#", "Phone", "Donor", "Area", "Parts", "Photos", "Status", "Listed", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-mono">{l.id}</td>
                <td className="px-4 py-3"><Link to="/listings/$id" params={{ id: String(l.id) }} className="font-medium text-primary underline-offset-4 hover:underline">{l.model}</Link></td>
                <td className="px-4 py-3">{l.donor}</td>
                <td className="px-4 py-3">{l.area}</td>
                <td className="px-4 py-3 font-mono">{l.parts}</td>
                <td className="px-4 py-3 font-mono">{l.photos}</td>
                <td className="px-4 py-3"><PlainBadge kind={l.status === "active" ? "info" : "off"}>{listingStatusLabel[l.status]}</PlainBadge></td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(l.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  {l.status === "active" && (
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      action={async () => {
                        const reason = window.prompt("Why are you removing this listing? The donor will see this.");
                        if (!reason) return;
                        await remove({ data: { id: l.id, reason } });
                        await router.invalidate();
                      }}
                    >
                      Remove
                    </ActionButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
