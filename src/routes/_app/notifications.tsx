import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Card, Empty, PageHeader } from "@/components/ui/card";
import { getNotificationsFn, markNotificationsReadFn } from "@/fns/notifications";
import { cn, fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  loader: () => getNotificationsFn(),
  head: () => ({ meta: [{ title: "Notifications — ReJenga" }] }),
  component: Notifications,
});

function Notifications() {
  const rows = Route.useLoaderData();
  const markRead = useServerFn(markNotificationsReadFn);
  const router = useRouter();
  const hasUnread = rows.some((r) => !r.readAt);
  useEffect(() => {
    if (hasUnread) markRead().then(() => router.invalidate({ filter: (m) => m.routeId === "__root__" }));
  }, [hasUnread, markRead, router]);
  return (
    <>
      <PageHeader tag="Inbox" title="Notifications" />
      {rows.length === 0 ? (
        <Empty>Nothing yet. You'll be notified about matches, reservations, inspections and account changes.</Empty>
      ) : (
        <Card className="divide-y">
          {rows.map((n) => {
            const body = (
              <div className={cn("flex items-start gap-3 px-5 py-4", !n.readAt && "bg-accent/50")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-copper")} aria-hidden="true" />
                <div>
                  <p className="text-sm">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return n.link ? <Link key={n.id} to={n.link} className="block hover:bg-muted/60">{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </Card>
      )}
    </>
  );
}
