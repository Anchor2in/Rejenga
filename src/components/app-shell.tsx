import { Link } from "@tanstack/react-router";
import { Bell, ClipboardCheck, LayoutDashboard, LogOut, Menu, PackageSearch, Settings2, Smartphone, Users, Wrench, X, BarChart3, Handshake } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof Bell; exact?: boolean };

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, unread, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const active = user.status === "active";
  const items: NavItem[] = [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];
  if (active && user.role !== "technician") {
    items.push({ to: "/listings", label: "My phones", icon: Smartphone }, { to: "/requests", label: "My requests", icon: PackageSearch }, { to: "/matches", label: "Matches", icon: Handshake });
  }
  if (active && user.role !== "community") items.push({ to: "/technician", label: "Inspections", icon: ClipboardCheck });
  if (active && user.role === "admin") {
    items.push(
      { to: "/admin", label: "Reports", icon: BarChart3, exact: true },
      { to: "/admin/users", label: "Accounts", icon: Users },
      { to: "/admin/listings", label: "Listings", icon: Wrench },
      { to: "/admin/catalogue", label: "Catalogue", icon: Settings2 },
    );
  }
  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: !!exact }}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-foreground/75 hover:bg-white/8 hover:text-ink-foreground data-[status=active]:bg-white/10 data-[status=active]:font-semibold data-[status=active]:text-ink-foreground"
        >
          <Icon className="size-4" aria-hidden="true" /> {label}
        </Link>
      ))}
    </nav>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className={cn("bg-bench fixed inset-y-0 left-0 z-40 flex w-60 flex-col p-4 transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between">
          <Logo tone="light" />
          <Button variant="ghost" size="icon" className="text-ink-foreground lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </Button>
        </div>
        <div className="mt-8 flex-1">{nav}</div>
        <div className="border-t border-white/10 pt-4 text-ink-foreground">
          <p className="truncate text-sm font-semibold">{user.name}</p>
          <p className="label-tag mt-0.5 text-ink-foreground/50">{user.role === "community" ? "Donor · Recipient" : user.role}</p>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm text-ink-foreground/70 hover:text-ink-foreground">
            <LogOut className="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <span className="label-tag hidden text-muted-foreground lg:block">MKU Thika pilot</span>
          <Link to="/notifications" className="relative grid size-10 place-items-center rounded-lg hover:bg-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
            <Bell className="size-5" aria-hidden="true" />
            {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-copper px-1 text-[0.65rem] font-bold text-copper-foreground">{unread > 9 ? "9+" : unread}</span>}
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
