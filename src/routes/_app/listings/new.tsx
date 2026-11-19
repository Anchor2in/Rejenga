import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { getCatalogueFn } from "@/fns/catalogue";
import { createListingFn } from "@/fns/listings";
import { donorConditionLabel, type DonorCondition } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/listings/new")({
  loader: () => getCatalogueFn(),
  head: () => ({ meta: [{ title: "List a phone — ReJenga" }] }),
  component: NewListing,
});

type PartChoice = { donorCondition: DonorCondition; donorNotes: string };

function NewListing() {
  const { models, parts, areas } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const create = useServerFn(createListingFn);
  const [chosen, setChosen] = useState<Record<number, PartChoice>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [batterySafe, setBatterySafe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const batteryChosen = useMemo(() => parts.some((p) => p.isBattery && chosen[p.id]), [parts, chosen]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const payload = {
      modelId: Number(f.get("modelId")),
      areaId: Number(f.get("areaId")),
      visibleCondition: String(f.get("visibleCondition")),
      description: String(f.get("description") ?? ""),
      parts: Object.entries(chosen).map(([id, c]) => ({ partTypeId: Number(id), ...c })),
      batterySafe,
    };
    if (!payload.parts.length) return setError("Choose at least one part you can give.");
    const body = new FormData();
    body.set("payload", JSON.stringify(payload));
    photos.forEach((p) => body.append("photos", p));
    setBusy(true);
    setError(null);
    try {
      const id = await create({ data: body });
      await navigate({ to: "/listings/$id", params: { id: String(id) } });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader tag="Donor" title="List a phone" />
      <form method="post" onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid gap-6">
          <Card className="grid gap-4 p-6">
            <h2 className="text-lg font-bold">The phone</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone model" htmlFor="modelId" hint="Only supported models can be matched.">
                <Select id="modelId" name="modelId" required defaultValue="">
                  <option value="" disabled>Choose a model…</option>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.modelName}</option>)}
                </Select>
              </Field>
              <Field label="Approximate area" htmlFor="areaId">
                <Select id="areaId" name="areaId" required defaultValue={user.areaId ?? ""}>
                  <option value="" disabled>Choose an area…</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.name}, {a.town}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Visible condition" htmlFor="visibleCondition" hint="What can you see? Cracks, dents, missing buttons, water marks.">
              <Textarea id="visibleCondition" name="visibleCondition" required minLength={5} placeholder="Screen cracked across the top, back cover fine, power button works." />
            </Field>
            <Field label="Anything else (optional)" htmlFor="description">
              <Textarea id="description" name="description" placeholder="How the phone broke, how long it has been unused…" />
            </Field>
          </Card>

          <Card className="grid gap-4 p-6">
            <div>
              <h2 className="text-lg font-bold">Parts you can give</h2>
              <p className="text-sm text-muted-foreground">Your description is shown as unverified until a technician checks the part.</p>
            </div>
            <div className="grid gap-3">
              {parts.map((p) => {
                const c = chosen[p.id];
                return (
                  <div key={p.id} className={cn("rounded-lg border p-3", c && "border-primary bg-secondary/40")}>
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type="checkbox"
                        checked={!!c}
                        onChange={(e) =>
                          setChosen((s) => {
                            const n = { ...s };
                            if (e.target.checked) n[p.id] = { donorCondition: "unsure", donorNotes: "" };
                            else delete n[p.id];
                            return n;
                          })
                        }
                        className="accent-[var(--color-primary)]"
                      />
                      {p.name}
                    </label>
                    {c && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <Select aria-label={`${p.name} condition`} value={c.donorCondition} onChange={(e) => setChosen((s) => ({ ...s, [p.id]: { ...c, donorCondition: e.target.value as DonorCondition } }))}>
                          {Object.entries(donorConditionLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                        <Input aria-label={`${p.name} notes`} placeholder="Notes (optional)" maxLength={300} value={c.donorNotes} onChange={(e) => setChosen((s) => ({ ...s, [p.id]: { ...c, donorNotes: e.target.value } }))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {batteryChosen && (
              <div className="rounded-lg border border-destructive/30 bg-danger-soft p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-destructive"><ShieldAlert className="size-4" aria-hidden="true" /> Battery safety</p>
                <p className="mt-1">Never list a battery that is swollen, leaking, hot, punctured or burnt. Keep a damaged battery away from heat and take it to an e-waste collection point.</p>
                <label className="mt-3 flex items-start gap-2">
                  <input type="checkbox" checked={batterySafe} onChange={(e) => setBatterySafe(e.target.checked)} className="mt-1" />
                  <span>As far as I can see, this battery is not swollen, leaking, hot or burnt.</span>
                </label>
              </div>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card className="grid gap-3 p-6">
            <h2 className="text-lg font-bold">Photos</h2>
            <p className="text-sm text-muted-foreground">Up to 4 photos (JPG, PNG or WebP, 5 MB each). The AI suggests the model and visible damage. It's a hint only and is never treated as verified.</p>
            <PhotoPicker files={photos} onChange={setPhotos} max={4} />
          </Card>
          <FormError error={error} />
          <Button type="submit" size="lg" variant="copper" disabled={busy}>{busy ? "Saving…" : "Publish listing"}</Button>
        </div>
      </form>
    </>
  );
}
