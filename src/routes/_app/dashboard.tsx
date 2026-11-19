import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, Clock, Handshake, PackageSearch, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { getDashboardFn } from "@/fns/dashboard";

export const Route = createFileRoute("/_app/dashboard")({
  loader: () => getDashboardFn(),
  head: () => ({ meta: [{ title: "Dashboard — ReJenga" }] }),
  component: Dashboard,
});

function Stat({ to, label, value, icon: Icon }: { to: string; label: string; value: number; icon: typeof Clock }) {
  return (
    <Link to={to} className="group">
      <Card className="flex items-center gap-4 p-5 transition-colors group-hover:border-copper">
        <span className="grid size-11 place-items-center rounded-lg bg-secondary text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-display text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

function Dashboard() {
  const { user, stats } = Route.useLoaderData();
  if (!stats) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <Clock className="mx-auto size-10 text-copper" aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-bold">{user.status === "suspended" ? "Your account is suspended" : "Waiting for approval"}</h1>
        <p className="mt-2 text-muted-foreground">
          {user.status === "suspended"
            ? "Contact the ReJenga administrator if you think this is a mistake."
            : "An administrator needs to approve your account before you can list phones, request parts or inspect. You'll get a notification here when it's done."}
        </p>
      </Card>
    );
  }
  return (
    <>
      <PageHeader tag={user.role === "community" ? "Donor · Recipient" : user.role} title={`Hi, ${user.name.split(" ")[0]}`}>
        {user.role !== "technician" && (
          <>
            <Button asChild variant="copper"><Link to="/listings/new"><Smartphone /> List a phone</Link></Button>
            <Button asChild variant="outline"><Link to="/requests/new"><PackageSearch /> Request a part</Link></Button>
          </>
        )}
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {user.role !== "technician" && (
          <>
            <Stat to="/listings" label="Active phone listings" value={stats.listings} icon={Smartphone} />
            <Stat to="/requests" label="Open part requests" value={stats.requests} icon={PackageSearch} />
            <Stat to="/matches" label="Reservations in progress" value={stats.openMatches} icon={Handshake} />
          </>
        )}
        {user.role !== "community" && <Stat to="/technician" label="Parts waiting for inspection" value={stats.waitingInspection} icon={ClipboardCheck} />}
        {user.role === "admin" && <Stat to="/admin/users" label="Accounts waiting for approval" value={stats.pendingUsers} icon={Users} />}
      </div>
      {user.role !== "technician" && (
        <Card className="bg-mat mt-8 grid gap-6 p-6 md:grid-cols-3">
          {[
            ["1. List or request", "List an old phone and the parts you can give, or ask for the part your phone needs."],
            ["2. Reserve a match", "Matches come from the supported-device catalogue. Each one says why it was suggested and what is still unverified."],
            ["3. Technician check", "A technician inspects the part before handover. Unsafe parts are blocked for good."],
          ].map(([t, d]) => (
            <div key={t}>
              <p className="font-display font-bold">{t}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </Card>
      )}
      {user.role === "technician" && (
        <Button asChild className="mt-8" size="lg"><Link to="/technician">Open inspection queue <ArrowRight /></Link></Button>
      )}
    </>
  );
}
