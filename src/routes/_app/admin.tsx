import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin")({
  beforeLoad: ({ context }) => {
    if (context.user?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  component: Outlet,
});
