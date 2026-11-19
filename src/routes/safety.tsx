import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/safety")({
  head: () => ({ meta: [{ title: "Part safety · ReJenga" }] }),
  component: SafetyPage,
});

const signs = ["Swollen, bulging or puffy", "Leaking, wet or smells sweet or chemical", "Punctured, dented or cut", "Hot to the touch without charging", "Burnt, scorched or discoloured"];

function SafetyPage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/" aria-label="ReJenga home">
          <Logo />
        </Link>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard">Dashboard</Link>
        </Button>
      </header>
      <main className="mx-auto grid max-w-3xl gap-6 px-4 pb-16">
        <div>
          <p className="label-tag text-copper">Safety guidance</p>
          <h1 className="mt-2 text-3xl font-bold">Damaged batteries and unsafe parts</h1>
          <p className="mt-3 text-muted-foreground">
            ReJenga never decides from a photo whether a part is safe. A technician checks reserved parts by hand, and anything they block as unsafe is never suggested again.
          </p>
        </div>
        <Card className="border-destructive/40 p-5">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <ShieldAlert className="size-5" aria-hidden="true" /> Don't list, use or hand over a battery that is:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6">
            {signs.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">If a part was blocked as unsafe</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>Don't charge, press, bend or puncture it, and keep it away from heat and flammable things.</li>
            <li>Don't put it in household rubbish. Take it to a phone repair shop or an e-waste collection point that accepts batteries.</li>
            <li>If it is smoking or very hot, move away from it and keep people back.</li>
            <li>If you were the recipient, your request is open again and ReJenga will suggest other parts.</li>
          </ul>
        </Card>
      </main>
    </div>
  );
}
