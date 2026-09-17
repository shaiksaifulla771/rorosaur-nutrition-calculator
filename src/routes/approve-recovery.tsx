import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { approvePasswordRecovery } from "@/lib/auth.functions";

export const Route = createFileRoute("/approve-recovery")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ token: typeof search["token"] === "string" ? search["token"] : "" }),
  head: () => ({ meta: [
    { title: "Approve recovery | Rorosaur" },
    { name: "description", content: "Administrator approval for an account recovery request." },
    { property: "og:title", content: "Approve recovery | Rorosaur" },
    { property: "og:description", content: "Administrator approval for an account recovery request." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ApproveRecoveryPage,
});

function ApproveRecoveryPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const approve = useServerFn(approvePasswordRecovery);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await approve({ data: { token } });
      setDone(true);
    } catch (failure) {
      const message = failure instanceof Error && failure.message.includes("Unauthorized")
        ? null
        : "Invalid or expired request";
      if (!message) {
        navigate({ to: "/auth", search: { redirect: `/approve-recovery?token=${encodeURIComponent(token)}` } });
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
        <ShieldCheck className="size-9 text-primary" />
        <h1 className="mt-4 font-display text-2xl font-semibold">Approve recovery</h1>
        <p className="mt-2 text-sm text-muted-foreground">Approve this request to send the account holder a secure password reset link.</p>
        {done ? (
          <p className="mt-6 text-sm font-medium">Recovery email sent.</p>
        ) : (
          <Button className="mt-6 w-full" onClick={() => void submit()} disabled={busy || !token}>
            {busy && <Loader2 className="size-4 animate-spin" />}Approve request
          </Button>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}