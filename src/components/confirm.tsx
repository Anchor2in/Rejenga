import { useState } from "react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/utils";

/** A button that runs an async action, asks for confirmation first if `confirm` is given, and shows errors inline. */
export function ActionButton({
  action,
  confirm,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & { action: () => Promise<unknown>; confirm?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-grid gap-1">
      <Button
        {...props}
        disabled={busy || props.disabled}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(null);
          try {
            await action();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </Button>
      {error && <span role="alert" className="max-w-xs text-xs text-destructive">{error}</span>}
    </span>
  );
}
