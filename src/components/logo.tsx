import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-center gap-2 font-display text-xl font-extrabold tracking-tight", className)} aria-label="ReJenga home">
      <span className="grid size-8 place-items-center rounded-lg bg-copper text-copper-foreground" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
          <path d="M10 6.5h4M9.5 12l2 2 3-3.5" />
        </svg>
      </span>
      <span className={tone === "light" ? "text-ink-foreground" : "text-foreground"}>
        Re<span className="text-copper">Jenga</span>
      </span>
    </Link>
  );
}
