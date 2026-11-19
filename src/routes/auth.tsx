import { createFileRoute, Link, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { signInFn, signUpFn } from "@/fns/auth";
import { getCatalogueFn } from "@/fns/catalogue";
import { cn, errorMessage } from "@/lib/utils";

const safeRedirect = (r?: string) => (r && r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\") ? r : "/dashboard");

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional(), mode: z.enum(["signin", "signup"]).optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.user) throw redirect({ href: safeRedirect(search.redirect) });
  },
  loader: () => getCatalogueFn(),
  head: () => ({ meta: [{ title: "Sign in — ReJenga" }] }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const { areas } = Route.useLoaderData();
  const [mode, setMode] = useState(search.mode ?? "signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signIn = useServerFn(signInFn);
  const signUp = useServerFn(signUpFn);
  const router = useRouter();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn({ data: { email: String(f.get("email")), password: String(f.get("password")) } });
      } else {
        await signUp({
          data: {
            name: String(f.get("name")),
            email: String(f.get("email")),
            phone: String(f.get("phone") ?? ""),
            password: String(f.get("password")),
            areaId: Number(f.get("areaId")),
            technician: f.get("technician") === "on",
          },
        });
      }
      await router.invalidate();
      await navigate({ href: safeRedirect(search.redirect) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bench grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <Logo tone="light" className="mb-6" />
        <Card className="p-6 sm:p-8">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={cn("rounded-md py-2 text-sm font-semibold", mode === m ? "bg-card shadow-bench" : "text-muted-foreground")}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <form method="post" onSubmit={onSubmit} className="grid gap-4">
            {mode === "signup" && (
              <>
                <Field label="Full name" htmlFor="name">
                  <Input id="name" name="name" autoComplete="name" required />
                </Field>
                <Field label="Phone (optional)" htmlFor="phone" hint="Shown only to the other person once a part is reserved.">
                  <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="07xx xxx xxx" />
                </Field>
              </>
            )}
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
              <Input id="password" name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : undefined} required />
            </Field>
            {mode === "signup" && (
              <>
                <Field label="Approximate area" htmlFor="areaId" hint="Used to rank nearby parts. We never track your exact location.">
                  <Select id="areaId" name="areaId" required defaultValue="">
                    <option value="" disabled>Choose an area…</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}, {a.town}</option>
                    ))}
                  </Select>
                </Field>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="technician" className="mt-1 accent-[var(--color-primary)]" />
                  <span>I'm a phone technician and want to inspect parts. <span className="text-muted-foreground">An administrator must approve technician accounts.</span></span>
                </label>
              </>
            )}
            <FormError error={error} />
            <Button type="submit" size="lg" variant="copper" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-ink-foreground/60">
          <Link to="/" className="hover:text-ink-foreground">← Back to the home page</Link>
        </p>
      </div>
    </div>
  );
}
