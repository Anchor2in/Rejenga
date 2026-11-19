import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function ErrorView({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="label-tag text-copper">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-bold">{error instanceof Error ? error.message : "Unexpected error"}</h1>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => router.invalidate()}>Try again</Button>
        <Button asChild><Link to="/">Go home</Link></Button>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="label-tag text-copper">404</p>
      <h1 className="mt-2 text-2xl font-bold">That page doesn't exist.</h1>
      <Button asChild className="mt-6"><Link to="/">Go home</Link></Button>
    </div>
  );
}
