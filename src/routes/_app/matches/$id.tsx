import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Phone, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { ActionButton } from "@/components/confirm";
import { AiSuggestion, InspectionBadge, MatchBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { cancelMatchFn, getMatchFn, inspectFn, outcomeFn } from "@/fns/matches";
import { donorConditionLabel } from "@/lib/types";
import { errorMessage, fmtDate, fmtDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/matches/$id")({
  loader: ({ params }) => getMatchFn({ data: Number(params.id) }),
  head: () => ({ meta: [{ title: "Reservation — ReJenga" }] }),
  component: MatchPage,
});

const fitLabel = { fits: "Fits", does_not_fit: "Does not fit", uncertain: "Not sure" } as const;
const decisionLabel = { accepted: "Accepted", rejected: "Rejected", unsafe: "Blocked as unsafe" } as const;

function MatchPage() {
  const { match: m, inspection, photos, viewer } = Route.useLoaderData();
  const router = useRouter();
  const cancel = useServerFn(cancelMatchFn);
  const outcome = useServerFn(outcomeFn);
  const refresh = () => router.invalidate();
  const reasons = m.reason.split("\n").filter(Boolean);

  return (
    <>
      <PageHeader tag={`Reservation #${m.id}`} title={`${m.partName}: ${m.donorModel} → ${m.recipientModel}`}>
        {viewer.canCancel && (
          <ActionButton variant="outline" confirm="Cancel this reservation? A safe part goes back to being available." action={async () => { await cancel({ data: { matchId: m.id } }); await refresh(); }}>
            Cancel reservation
          </ActionButton>
        )}
      </PageHeader>

      <Steps status={m.status} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid content-start gap-6">
          {viewer.canInspect && <InspectionForm matchId={m.id} isBattery={m.isBattery} onDone={refresh} />}

          {viewer.canRecordOutcome && (
            <Card className="grid gap-3 border-copper p-6">
              <h2 className="text-lg font-bold">Record the handover</h2>
              <p className="text-sm text-muted-foreground">Arrange the handover directly with the donor. ReJenga doesn't handle payment, transport or repair. Record what happened here.</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton variant="copper" action={async () => { await outcome({ data: { matchId: m.id, outcome: "completed" } }); await refresh(); }}>I received the part</ActionButton>
                <ActionButton variant="outline" confirm="Decline this part? It goes back to being available to others." action={async () => { await outcome({ data: { matchId: m.id, outcome: "declined" } }); await refresh(); }}>I declined it</ActionButton>
              </div>
            </Card>
          )}

          {inspection && (
            <Card className="p-6">
              <h2 className="text-lg font-bold">Technician inspection</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Technician</dt><dd className="font-medium">{inspection.technicianName}</dd></div>
                <div><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{fmtDateTime(inspection.inspectedAt)}</dd></div>
                <div><dt className="text-muted-foreground">Fit</dt><dd className="font-medium">{fitLabel[inspection.fit]}</dd></div>
                <div><dt className="text-muted-foreground">Decision</dt><dd className="font-medium">{decisionLabel[inspection.decision]}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Observed condition</dt><dd className="whitespace-pre-line">{inspection.observedCondition}</dd></div>
                {inspection.notes && <div className="sm:col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-line">{inspection.notes}</dd></div>}
              </dl>
            </Card>
          )}

          <Card className="p-6">
            <h2 className="text-lg font-bold">Why this was matched</h2>
            <ul className="mt-3 grid gap-1.5 text-sm">
              {reasons.map((r) => (
                <li key={r} className={r.startsWith("Unverified:") ? "text-warning" : ""}>{r.startsWith("Unverified:") ? "? " : "✓ "}{r.replace(/^Unverified:\s*/, "Unverified: ")}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Catalogue rule source: {m.ruleSource}</p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold">From the donor (unverified)</h2>
            <p className="mt-2 text-sm"><span className="text-muted-foreground">Part condition:</span> {donorConditionLabel[m.donorCondition]}{m.donorNotes ? ` — ${m.donorNotes}` : ""}</p>
            <p className="mt-1 text-sm"><span className="text-muted-foreground">Phone:</span> {m.visibleCondition}</p>
            <p className="mt-3 text-sm"><span className="text-muted-foreground">Recipient's problem:</span> {m.problem}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <div key={p.id} className="grid gap-1">
                  <img src={`/photos/${p.fileName}`} alt="Donor phone" className="aspect-[4/3] w-full rounded-lg border object-cover" loading="lazy" />
                  <AiSuggestion photo={p} compact />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid content-start gap-4">
          <Card className="grid gap-3 p-5 text-sm">
            <MatchBadge status={m.status} />
            <InspectionBadge status={m.inspectionStatus} />
            <p><span className="text-muted-foreground">Reserved:</span> {fmtDateTime(m.reservedAt)}</p>
            {(m.status === "reserved" || m.status === "accepted") && <p><span className="text-muted-foreground">Expires:</span> {fmtDate(m.expiresAt)}</p>}
            {m.closedAt && <p><span className="text-muted-foreground">Closed:</span> {fmtDateTime(m.closedAt)}</p>}
            {m.outcomeNote && <p><span className="text-muted-foreground">Note:</span> {m.outcomeNote}</p>}
            {m.distanceKm != null && <p><span className="text-muted-foreground">Distance:</span> about {m.distanceKm.toFixed(1)} km</p>}
          </Card>
          <Card className="grid gap-3 p-5 text-sm">
            <Party label="Donor" name={m.donorName} area={m.donorArea} phone={m.donorPhone} you={viewer.isDonor} />
            <Party label="Recipient" name={m.recipientName} area={m.recipientArea} phone={m.recipientPhone} you={viewer.isRecipient} />
            {!m.donorPhone && !m.recipientPhone && (m.status === "reserved" || m.status === "accepted") && <p className="text-xs text-muted-foreground">Add a phone number to your account so the other person can reach you.</p>}
          </Card>
          {viewer.isRecipient && <Button asChild variant="outline"><Link to="/requests/$id" params={{ id: String(m.requestId) }}>Back to request</Link></Button>}
          {viewer.isDonor && <Button asChild variant="outline"><Link to="/listings/$id" params={{ id: String(m.listingId) }}>Back to listing</Link></Button>}
        </div>
      </div>
    </>
  );
}

function Party({ label, name, area, phone, you }: { label: string; name: string; area: string; phone: string | null; you: boolean }) {
  return (
    <div>
      <p className="label-tag text-muted-foreground">{label}{you ? " · you" : ""}</p>
      <p className="font-medium">{name} <span className="font-normal text-muted-foreground">· {area}</span></p>
      {phone && !you && <a href={`tel:${phone}`} className="mt-0.5 inline-flex items-center gap-1 text-primary underline"><Phone className="size-3.5" aria-hidden="true" />{phone}</a>}
    </div>
  );
}

function Steps({ status }: { status: string }) {
  const failed = ["rejected", "blocked_unsafe", "cancelled", "expired", "declined"].includes(status);
  const idx = { reserved: 1, accepted: 2, completed: 3 }[status] ?? 1;
  const steps = ["Reserved", "Technician check", "Handover"];
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const done = !failed && i < idx;
        const current = !failed && i === idx;
        return (
          <li key={s} className={`rounded-lg border px-3 py-2 text-sm ${done ? "border-success bg-success-soft text-success" : current ? "border-copper bg-accent font-semibold" : "bg-card text-muted-foreground"}`} aria-current={current ? "step" : undefined}>
            <span className="label-tag">{i + 1}</span> {s}
          </li>
        );
      })}
    </ol>
  );
}

function InspectionForm({ matchId, isBattery, onDone }: { matchId: number; isBattery: boolean; onDone: () => Promise<void> }) {
  const inspect = useServerFn(inspectFn);
  const [fit, setFit] = useState<"fits" | "does_not_fit" | "uncertain">("fits");
  const [decision, setDecision] = useState<"accepted" | "rejected" | "unsafe">("accepted");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="border-copper p-6">
      <h2 className="text-lg font-bold">Record inspection</h2>
      <p className="text-sm text-muted-foreground">Check the part by hand before the handover. Your record replaces the donor's unverified description.</p>
      <form method="post"
        className="mt-4 grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (decision === "unsafe" && !window.confirm("Block this part as unsafe? It will never be suggested again.")) return;
          setBusy(true);
          setError(null);
          try {
            await inspect({ data: { matchId, fit, decision, observedCondition: String(f.get("observed")), notes: String(f.get("notes") ?? "") } });
            await onDone();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Observed condition" htmlFor="observed">
          <Textarea id="observed" name="observed" required minLength={5} placeholder="Display lights evenly, no dead pixels; small scratch on the frame." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Does it fit the recipient's phone?" htmlFor="fit">
            <Select id="fit" value={fit} onChange={(e) => { const v = e.target.value as typeof fit; setFit(v); if (v !== "fits" && decision === "accepted") setDecision("rejected"); }}>
              {Object.entries(fitLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Decision" htmlFor="decision">
            <Select id="decision" value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
              <option value="accepted" disabled={fit !== "fits"}>Accept for handover</option>
              <option value="rejected">Reject (not suitable)</option>
              <option value="unsafe">Block as unsafe</option>
            </Select>
          </Field>
        </div>
        {(decision === "unsafe" || isBattery) && (
          <p className="flex gap-2 rounded-lg bg-danger-soft p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Block swollen, leaking, punctured or overheating batteries and any part that could hurt someone. Blocked parts are removed from matching for good.
          </p>
        )}
        <Field label="Notes (optional)" htmlFor="notes">
          <Textarea id="notes" name="notes" />
        </Field>
        <FormError error={error} />
        <Button type="submit" variant={decision === "unsafe" ? "destructive" : "default"} disabled={busy} className="justify-self-start">
          {busy ? "Saving…" : "Save inspection"}
        </Button>
      </form>
    </Card>
  );
}
