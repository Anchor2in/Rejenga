import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Ban, ClipboardCheck, MapPin, MessageSquareQuote, PackageSearch, ShieldAlert, ShieldCheck, Smartphone, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import hero from "@/assets/hero-workbench.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReJenga — Reuse phone parts, repair more phones" },
      {
        name: "description",
        content:
          "List an old phone's working parts or request the part you need. ReJenga matches them by model and a technician checks every part before handover.",
      },
      { property: "og:title", content: "ReJenga — Reuse phone parts, repair more phones" },
      {
        property: "og:description",
        content: "A community parts-matching site for students, phone owners and repair technicians around MKU Thika.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  { icon: Smartphone, title: "List a phone", body: "Donors add a broken or unused phone, its visible condition, an approximate area and which parts they can give." },
  { icon: PackageSearch, title: "Request a part", body: "Recipients pick their phone model, the part they need and describe the problem." },
  { icon: ClipboardCheck, title: "See explained matches", body: "ReJenga only suggests parts the catalogue says fit, ranked by inspection status and distance — with the reason shown." },
  { icon: Wrench, title: "Technician checks it", body: "A reserved part is physically inspected. Accepted, rejected, or blocked as unsafe — then you record the handover." },
];

function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const next = sessionStorage.getItem("rejenga:after-login");
    if (next) {
      sessionStorage.removeItem("rejenga:after-login");
      if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) navigate({ href: next });
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-bench relative overflow-hidden text-ink-foreground">
        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <Logo tone="light" />
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild variant="copper" size="sm">
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="bench" size="sm" className="border-transparent">
                  <Link to="/auth" search={{ redirect: undefined }}>Sign in</Link>
                </Button>
                <Button asChild variant="copper" size="sm">
                  <Link to="/auth" search={{ mode: "signup" }}>Join the pilot</Link>
                </Button>
              </>
            )}
          </nav>
        </header>
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-8 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-12">
          <div className="animate-rise">
            <p className="label-tag mb-4 inline-flex items-center gap-2 rounded-full border border-ink-foreground/20 px-3 py-1 text-copper">
              <MapPin className="size-3.5" aria-hidden="true" /> Pilot around MKU, Thika
            </p>
            <h1 className="font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl lg:text-7xl">
              Your old phone has <span className="text-copper">parts</span> someone needs.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-foreground/75">
              ReJenga connects reusable screens, batteries and charging boards from broken or unused phones with people
              who need a repair — and keeps a technician in the loop before any part changes hands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="copper" size="lg">
                <Link to={user ? "/listings/new" : "/auth"} search={user ? undefined : { redirect: "/listings/new" }}>
                  List a phone <ArrowRight />
                </Link>
              </Button>
              <Button asChild variant="bench" size="lg">
                <Link to={user ? "/requests/new" : "/auth"} search={user ? undefined : { redirect: "/requests/new" }}>
                  Request a part
                </Link>
              </Button>
            </div>
          </div>
          <div className="relative animate-rise [animation-delay:120ms]">
            <img
              src={hero}
              alt="A technician's hands working on a phone charging board, surrounded by opened phones, batteries and tools"
              className="aspect-[4/4.2] w-full rounded-2xl object-cover shadow-lift"
            />
            <div className="absolute -bottom-5 left-4 right-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-bench sm:left-8 sm:right-auto sm:max-w-xs">
              <p className="label-tag text-muted-foreground">Candidate · Tecno Spark 10</p>
              <p className="mt-1 font-semibold">Screen — about 2 km away</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-success">
                  <ShieldCheck className="size-3" aria-hidden="true" /> Technician-checked
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-soft px-2 py-0.5 text-muted-foreground">
                  Same model
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-mat border-b">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <p className="label-tag text-copper">How it works</p>
          <h2 className="mt-2 max-w-2xl text-4xl font-bold">Four steps from drawer to repair.</h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-xl border bg-card p-5 shadow-bench">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                    <s.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Labels */}
      <section className="mx-auto max-w-7xl px-4 py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="label-tag text-copper">Honest labels</p>
            <h2 className="mt-2 text-4xl font-bold">A match is a suggestion, not a guarantee.</h2>
            <p className="mt-4 text-muted-foreground">
              Two parts with similar names aren't always the same, and a part can look fine but be faulty. ReJenga keeps
              what the donor says separate from what a technician actually found.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              { icon: MessageSquareQuote, tone: "bg-warning-soft text-warning", title: "Not inspected yet", body: "Only the donor's description. Fit comes from the catalogue rule shown with the match." },
              { icon: ShieldCheck, tone: "bg-success-soft text-success", title: "Technician-checked", body: "A technician physically inspected the part and recorded its condition and fit. Not a warranty." },
              { icon: ShieldAlert, tone: "bg-danger-soft text-destructive", title: "Blocked: unsafe", body: "Found unsafe (for example a swollen battery). Never suggested to anyone again." },
            ].map((l) => (
              <div key={l.title} className="flex gap-4 rounded-xl border bg-card p-4">
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${l.tone}`}>
                  <l.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-semibold">{l.title}</h3>
                  <p className="text-sm text-muted-foreground">{l.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Boundaries */}
      <section className="bg-bench text-ink-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 md:grid-cols-2">
          <div>
            <p className="label-tag text-copper">What ReJenga doesn't do</p>
            <h2 className="mt-2 text-3xl font-bold">You arrange the handover. We keep the record.</h2>
          </div>
          <ul className="grid gap-3 text-ink-foreground/80">
            {[
              "No payments or money handling",
              "No transport or storage of devices",
              "No repairs — technicians inspect, you decide",
              "No guessing internal condition from photos",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <Ban className="size-4 text-copper" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p>A Mount Kenya University computing project · Thika pilot</p>
        </div>
      </footer>
    </div>
  );
}
