import { useState } from "react";
import { Loader2, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { createProfile, profileNameError, type UserProfile } from "@/lib/session";

/**
 * Account-owned profile step. A profile is chosen once after each fresh login.
 */
export function ProfileGate({ profiles }: { profiles: UserProfile[] }) {
  const { chooseProfile, signOut } = useSession();
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameError = profileNameError(name, profiles);

  const pick = async (id: string) => {
    setBusy(true);
    try {
      await chooseProfile(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that profile");
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    setBusy(true);
    try {
      const created = await createProfile(name);
      await chooseProfile(created.id);
      toast.success(`Profile "${created.display_name}" created`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create the profile";
      toast.error(message);
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-lg text-center">
        <h1 className="font-display text-2xl font-semibold">
          {creating ? "Create your profile" : "Select profile"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {creating
            ? "Give your profile a name. Everything you create is recorded against it."
            : "Choose a profile to continue."}
        </p>

        {!creating && (
          <>
            <ul className="mt-8 flex flex-wrap justify-center gap-4">
              {profiles.map((p) => (
                <li key={p.id} className="relative">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void pick(p.id)}
                    className="group flex w-28 flex-col items-center gap-2 rounded-xl p-3 transition hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  >
                    <span className="flex size-20 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/20">
                      <UserRound className="size-8" />
                    </span>
                    <span className="w-full truncate text-sm font-medium">{p.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-6" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Create new profile
            </Button>
          </>
        )}

        {creating && (
          <form onSubmit={submit} className="mx-auto mt-8 max-w-sm text-left">
            <label className="text-sm font-medium">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={Boolean(touched && nameError)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {touched && nameError && (
                <span className="mt-1 block text-xs font-normal text-destructive">{nameError}</span>
              )}
            </label>
            <div className="mt-4 flex gap-2">
              <Button type="submit" disabled={busy || Boolean(nameError)} className="flex-1">
                {busy && <Loader2 className="size-4 animate-spin" />} Continue
              </Button>
              {profiles.length > 0 && (
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-10 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </div>

    </main>
  );
}
