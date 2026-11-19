import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, FormError, Select, Textarea } from "@/components/ui/form";
import { getCatalogueFn } from "@/fns/catalogue";
import { createRequestFn } from "@/fns/requests";
import { errorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/requests/new")({
  loader: () => getCatalogueFn(),
  head: () => ({ meta: [{ title: "Request a part — ReJenga" }] }),
  component: NewRequest,
});

function NewRequest() {
  const { models, parts, areas } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const create = useServerFn(createRequestFn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const id = await create({ data: { modelId: Number(f.get("modelId")), partTypeId: Number(f.get("partTypeId")), areaId: Number(f.get("areaId")), problem: String(f.get("problem")) } });
      await navigate({ to: "/requests/$id", params: { id: String(id) } });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader tag="Recipient" title="Request a part" />
      <Card className="max-w-2xl p-6">
        <form method="post" onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your phone model" htmlFor="modelId" hint="Not listed? The pilot only supports these models for now.">
              <Select id="modelId" name="modelId" required defaultValue="">
                <option value="" disabled>Choose a model…</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.modelName}</option>)}
              </Select>
            </Field>
            <Field label="Part you need" htmlFor="partTypeId">
              <Select id="partTypeId" name="partTypeId" required defaultValue="">
                <option value="" disabled>Choose a part…</option>
                {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Approximate area" htmlFor="areaId">
            <Select id="areaId" name="areaId" required defaultValue={user.areaId ?? ""}>
              <option value="" disabled>Choose an area…</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.name}, {a.town}</option>)}
            </Select>
          </Field>
          <Field label="What's wrong with your phone?" htmlFor="problem">
            <Textarea id="problem" name="problem" required minLength={5} placeholder="Screen shattered after a fall; touch still works on the bottom half." />
          </Field>
          <FormError error={error} />
          <Button type="submit" size="lg" variant="copper" disabled={busy} className="justify-self-start">{busy ? "Saving…" : "Find matching parts"}</Button>
        </form>
      </Card>
    </>
  );
}
