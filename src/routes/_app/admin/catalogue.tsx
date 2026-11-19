import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PlainBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { addAreaFn, addModelFn, addPartTypeFn, addRuleFn, getCatalogueAdminFn, toggleCatalogueFn } from "@/fns/catalogue";
import { cn, errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/catalogue")({
  loader: () => getCatalogueAdminFn(),
  head: () => ({ meta: [{ title: "Catalogue — ReJenga" }] }),
  component: Catalogue,
});

const tabs = ["Compatibility rules", "Device models", "Part types", "Areas"] as const;

function useSubmit(fn: (f: FormData) => Promise<unknown>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await fn(new FormData(form));
      form.reset();
      await router.invalidate();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { onSubmit, error, busy };
}

function Toggle({ kind, id, active }: { kind: "model" | "part" | "area" | "rule"; id: number; active: boolean }) {
  const toggle = useServerFn(toggleCatalogueFn);
  const router = useRouter();
  return (
    <button
      role="switch"
      aria-checked={active}
      aria-label={active ? "Active — click to switch off" : "Inactive — click to switch on"}
      onClick={async () => { await toggle({ data: { kind, id, active: !active } }); await router.invalidate(); }}
      className={cn("relative h-6 w-11 rounded-full transition-colors", active ? "bg-primary" : "bg-input")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", active ? "left-[1.375rem]" : "left-0.5")} />
    </button>
  );
}

function Catalogue() {
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0]);
  const addRule = useServerFn(addRuleFn);
  const addModel = useServerFn(addModelFn);
  const addPart = useServerFn(addPartTypeFn);
  const addArea = useServerFn(addAreaFn);
  const rule = useSubmit((f) => addRule({ data: { donorModelId: Number(f.get("donor")), recipientModelId: Number(f.get("recipient")), partTypeId: Number(f.get("part")), source: String(f.get("source")), notes: String(f.get("notes") ?? ""), bothWays: f.get("bothWays") === "on" } }));
  const model = useSubmit((f) => addModel({ data: { brand: String(f.get("brand")), modelName: String(f.get("modelName")), sameModelRules: f.get("same") === "on" } }));
  const part = useSubmit((f) => addPart({ data: { name: String(f.get("name")), isBattery: f.get("isBattery") === "on" } }));
  const area = useSubmit((f) => addArea({ data: { name: String(f.get("name")), town: String(f.get("town")), lat: Number(f.get("lat")), lng: Number(f.get("lng")) } }));
  const modelOpts = data.models.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.modelName}{m.active ? "" : " (inactive)"}</option>);

  return (
    <>
      <PageHeader tag="Administrator" title="Supported-device catalogue" />
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-muted-foreground">Matching only uses active rules. A rule says a part from the donor model can be used in the recipient model. Record where each rule comes from so technicians can trust it.</p>
      <div className="mb-6 flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-card shadow-bench" : "text-muted-foreground")}>{t}</button>
        ))}
      </div>

      {tab === "Compatibility rules" && (
        <div className="grid gap-6">
          <Card className="p-5">
            <form method="post" onSubmit={rule.onSubmit} className="grid gap-3 md:grid-cols-3">
              <Field label="Donor model" htmlFor="donor"><Select id="donor" name="donor" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...modelOpts]}</Select></Field>
              <Field label="Recipient model" htmlFor="recipient"><Select id="recipient" name="recipient" required defaultValue="">{[<option key="" value="" disabled>Choose…</option>, ...modelOpts]}</Select></Field>
              <Field label="Part" htmlFor="part"><Select id="part" name="part" required defaultValue=""><option value="" disabled>Choose…</option>{data.parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Source" htmlFor="source"><Input id="source" name="source" required placeholder="e.g. Verified by technician J. Mwangi" /></Field>
              <Field label="Notes (optional)" htmlFor="notes"><Input id="notes" name="notes" /></Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="bothWays" defaultChecked /> Works both ways</label>
              <div className="md:col-span-3"><FormError error={rule.error} /></div>
              <Button type="submit" disabled={rule.busy} className="justify-self-start">Add rule</Button>
            </form>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b text-left text-muted-foreground"><tr>{["Donor model", "Recipient model", "Part", "Source", "Active"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y">
                {data.rules.map((r) => (
                  <tr key={r.id} className={r.active ? "" : "text-muted-foreground"}>
                    <td className="px-4 py-2.5">{r.donor}</td>
                    <td className="px-4 py-2.5">{r.recipient}{r.sameModel && <PlainBadge kind="info"> same model</PlainBadge>}</td>
                    <td className="px-4 py-2.5">{r.part}</td>
                    <td className="px-4 py-2.5">{r.source}{r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}</td>
                    <td className="px-4 py-2.5"><Toggle kind="rule" id={r.id} active={r.active} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "Device models" && (
        <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
          <Card className="h-fit p-5">
            <form method="post" onSubmit={model.onSubmit} className="grid gap-3">
              <Field label="Brand" htmlFor="brand"><Input id="brand" name="brand" required placeholder="Tecno" /></Field>
              <Field label="Model" htmlFor="modelName"><Input id="modelName" name="modelName" required placeholder="Spark 10" /></Field>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="same" defaultChecked className="mt-1" /> Add same-model rules for every part type</label>
              <FormError error={model.error} />
              <Button type="submit" disabled={model.busy}>Add model</Button>
            </form>
          </Card>
          <Card className="divide-y">
            {data.models.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3"><span className={m.active ? "" : "text-muted-foreground"}>{m.brand} {m.modelName}</span><Toggle kind="model" id={m.id} active={m.active} /></div>
            ))}
          </Card>
        </div>
      )}

      {tab === "Part types" && (
        <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
          <Card className="h-fit p-5">
            <form method="post" onSubmit={part.onSubmit} className="grid gap-3">
              <Field label="Part name" htmlFor="pname"><Input id="pname" name="name" required placeholder="Earpiece speaker" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isBattery" /> This is a battery (extra safety checks)</label>
              <FormError error={part.error} />
              <Button type="submit" disabled={part.busy}>Add part type</Button>
            </form>
          </Card>
          <Card className="divide-y">
            {data.parts.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3"><span className={p.active ? "" : "text-muted-foreground"}>{p.name}{p.isBattery && <PlainBadge kind="bad"> battery</PlainBadge>}</span><Toggle kind="part" id={p.id} active={p.active} /></div>
            ))}
          </Card>
        </div>
      )}

      {tab === "Areas" && (
        <div className="grid gap-6 md:grid-cols-[20rem_1fr]">
          <Card className="h-fit p-5">
            <form method="post" onSubmit={area.onSubmit} className="grid gap-3">
              <Field label="Area name" htmlFor="aname"><Input id="aname" name="name" required placeholder="Makongeni" /></Field>
              <Field label="Town" htmlFor="town"><Input id="town" name="town" required placeholder="Thika" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Latitude" htmlFor="lat"><Input id="lat" name="lat" type="number" step="0.0001" required placeholder="-1.0396" /></Field>
                <Field label="Longitude" htmlFor="lng"><Input id="lng" name="lng" type="number" step="0.0001" required placeholder="37.0900" /></Field>
              </div>
              <p className="text-xs text-muted-foreground">Use the area's rough centre. It's only used to estimate distance.</p>
              <FormError error={area.error} />
              <Button type="submit" disabled={area.busy}>Add area</Button>
            </form>
          </Card>
          <Card className="divide-y">
            {data.areas.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-3"><span className={a.active ? "" : "text-muted-foreground"}>{a.name}, {a.town} <span className="font-mono text-xs text-muted-foreground">{a.lat.toFixed(3)}, {a.lng.toFixed(3)}</span></span><Toggle kind="area" id={a.id} active={a.active} /></div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}
