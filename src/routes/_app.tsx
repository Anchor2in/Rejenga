import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    if (context.user.status !== "active" && location.pathname !== "/dashboard" && location.pathname !== "/notifications") {
      throw redirect({ to: "/dashboard" });
    }
    return { user: context.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
