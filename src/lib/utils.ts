import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.");
