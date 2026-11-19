import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton } from "@/components/confirm";
import { PlainBadge } from "@/components/status";
import { Card, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { getUsersFn, updateUserFn } from "@/fns/admin";
import { fmtDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/users")({
  loader: () => getUsersFn(),
  head: () => ({ meta: [{ title: "Accounts — ReJenga" }] }),
  component: Users,
});

function Users() {
  const rows = Route.useLoaderData();
  const { user: me } = Route.useRouteContext();
  const update = useServerFn(updateUserFn);
  const router = useRouter();
  const act = async (data: Parameters<typeof update>[0]["data"]) => { await update({ data }); await router.invalidate(); };
  return (
    <>
      <PageHeader tag="Administrator" title="Accounts" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b text-left text-muted-foreground">
            <tr>{["Name", "Contact", "Area", "Role", "Status", "Joined", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((u) => (
              <tr key={u.id} className={u.status === "pending" ? "bg-warning-soft/40" : ""}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3"><div>{u.email}</div><div className="text-muted-foreground">{u.phone}</div></td>
                <td className="px-4 py-3">{u.area ?? "—"}</td>
                <td className="px-4 py-3">
                  <Select aria-label={`Role for ${u.name}`} value={u.role} disabled={u.id === me.id} onChange={(e) => act({ id: u.id, role: e.target.value as typeof u.role })} className="h-8 w-36">
                    <option value="community">Donor/recipient</option>
                    <option value="technician">Technician</option>
                    <option value="admin">Administrator</option>
                  </Select>
                </td>
                <td className="px-4 py-3"><PlainBadge kind={u.status === "active" ? "good" : u.status === "pending" ? "wait" : "bad"}>{u.status}</PlainBadge></td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  {u.id !== me.id && (u.status === "active" ? (
                    <ActionButton size="sm" variant="ghost" confirm={`Suspend ${u.name}? They will be signed out.`} action={() => act({ id: u.id, status: "suspended" })}>Suspend</ActionButton>
                  ) : (
                    <ActionButton size="sm" action={() => act({ id: u.id, status: "active" })}>{u.status === "pending" ? "Approve" : "Reactivate"}</ActionButton>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
