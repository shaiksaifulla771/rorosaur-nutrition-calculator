import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Salad } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { GENERIC_ERROR, passwordSchema } from "@/lib/auth-schema";
import { completePasswordRecovery } from "@/lib/auth.functions";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Reset password | Rorosaur" },
    { name: "description", content: "Choose a new Rorosaur account password." },
    { property: "og:title", content: "Reset password | Rorosaur" },
    { property: "og:description", content: "Choose a new Rorosaur account password." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const completeRecovery = useServerFn(completePasswordRecovery);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const recovery = hash.get("type") === "recovery";
    void supabase.auth.getSession().then(({ data }) => setValid(recovery && Boolean(data.session)));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? GENERIC_ERROR);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data });
    if (updateError) {
      setError(GENERIC_ERROR);
      setBusy(false);
      return;
    }
    await completeRecovery().catch(() => undefined);
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-8 shadow-sm">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Salad className="size-5" /></span>
        <h1 className="mt-5 font-display text-2xl font-semibold">Reset password</h1>
        {!valid ? (
          <div className="mt-5 space-y-4">
            <p role="alert" className="text-sm text-destructive">Invalid or expired request</p>
            <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth", search: { redirect: "/dashboard" } })}>Return to sign in</Button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
              <p className="text-xs text-muted-foreground">8–12 characters with uppercase, lowercase, number, and special character.</p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}Update password</Button>
          </form>
        )}
      </div>
    </main>
  );
}