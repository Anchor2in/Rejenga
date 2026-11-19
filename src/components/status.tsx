import { AlertTriangle, Ban, CircleDashed, ShieldCheck, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/card";
import type { InspectionStatus, MatchStatus, RequestStatus } from "@/lib/types";
import { matchStatusLabel, requestStatusLabel } from "@/lib/types";
import { cn, pct } from "@/lib/utils";

export const inspectionLabel: Record<InspectionStatus, string> = {
  not_inspected: "Not inspected yet",
  checked: "Technician-checked",
  rejected: "Rejected by technician",
  blocked_unsafe: "Blocked: unsafe",
};

export function InspectionBadge({ status, className }: { status: InspectionStatus; className?: string }) {
  const style = {
    not_inspected: ["bg-warning-soft text-warning", CircleDashed],
    checked: ["bg-success-soft text-success", ShieldCheck],
    rejected: ["bg-neutral-soft text-muted-foreground", XCircle],
    blocked_unsafe: ["bg-danger-soft text-destructive", Ban],
  } as const;
  const [cls, Icon] = style[status];
  return (
    <Badge className={cn(cls, className)}>
      <Icon aria-hidden="true" />
      {inspectionLabel[status]}
    </Badge>
  );
}

const tone = { good: "bg-success-soft text-success", wait: "bg-warning-soft text-warning", bad: "bg-danger-soft text-destructive", off: "bg-neutral-soft text-muted-foreground", info: "bg-secondary text-secondary-foreground" };

export function MatchBadge({ status }: { status: MatchStatus }) {
  const t = { reserved: tone.wait, accepted: tone.good, completed: tone.good, rejected: tone.off, declined: tone.off, cancelled: tone.off, expired: tone.off, blocked_unsafe: tone.bad }[status];
  return <Badge className={t}>{matchStatusLabel[status]}</Badge>;
}

export function RequestBadge({ status }: { status: RequestStatus }) {
  const t = { open: tone.info, reserved: tone.wait, fulfilled: tone.good, cancelled: tone.off }[status];
  return <Badge className={t}>{requestStatusLabel[status]}</Badge>;
}

export function PlainBadge({ children, kind = "off" }: { children: React.ReactNode; kind?: keyof typeof tone }) {
  return <Badge className={tone[kind]}>{children}</Badge>;
}

type Ai = {
  aiStatus: "pending" | "done" | "failed" | "disabled";
  aiModelLabel: string | null;
  aiModelConfidence: number | null;
  aiDamageLabel: string | null;
  aiDamageConfidence: number | null;
  aiLowConfidence: boolean | null;
};

/** Advisory AI output. Always labelled unverified; never used for safety or matching. */
export function AiSuggestion({ photo, compact }: { photo: Ai; compact?: boolean }) {
  if (photo.aiStatus === "disabled") return null;
  if (photo.aiStatus === "pending") return <p className="text-xs text-muted-foreground">AI photo check running…</p>;
  if (photo.aiStatus === "failed") return <p className="text-xs text-muted-foreground">AI photo check unavailable for this photo.</p>;
  return (
    <div className={cn("rounded-lg border border-dashed bg-muted/50 p-2 text-xs", compact && "p-1.5")}>
      <p className="label-tag !text-[0.62rem] text-muted-foreground">AI suggestion · unverified</p>
      <p className="mt-0.5">
        Looks like <strong>{photo.aiModelLabel ?? "unknown"}</strong> ({pct(photo.aiModelConfidence)}) · visible: <strong>{photo.aiDamageLabel ?? "unknown"}</strong> ({pct(photo.aiDamageConfidence)})
      </p>
      {photo.aiLowConfidence && (
        <p className="mt-1 flex items-center gap-1 text-warning">
          <AlertTriangle className="size-3" aria-hidden="true" /> Low confidence — ignore unless a person confirms it.
        </p>
      )}
    </div>
  );
}
