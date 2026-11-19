import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.ComponentProps<"div">) => (
  <div className={cn("rounded-xl border bg-card text-card-foreground shadow-bench", className)} {...p} />
);

export const Badge = ({ className, ...p }: React.ComponentProps<"span">) => (
  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3", className)} {...p} />
);

export function PageHeader({ tag, title, children }: { tag?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {tag && <p className="label-tag text-copper">{tag}</p>}
        <h1 className="mt-1 text-3xl font-bold">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed bg-card/60 p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
