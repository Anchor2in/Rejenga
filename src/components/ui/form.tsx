import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-lg border border-input bg-card px-3 text-sm placeholder:text-muted-foreground/70 disabled:opacity-60";

export const Input = ({ className, ...p }: React.ComponentProps<"input">) => <input className={cn(field, "h-10", className)} {...p} />;

export const Textarea = ({ className, ...p }: React.ComponentProps<"textarea">) => (
  <textarea className={cn(field, "min-h-24 py-2", className)} {...p} />
);

export const Select = ({ className, ...p }: React.ComponentProps<"select">) => (
  <select className={cn(field, "h-10 pr-8", className)} {...p} />
);

export const Label = ({ className, ...p }: React.ComponentProps<"label">) => (
  <label className={cn("text-sm font-medium", className)} {...p} />
);

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  );
}
