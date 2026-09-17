import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";

/** Signed in, but the account is not permitted. No rules are disclosed. */
export function AccessDenied({ email }: { email?: string }) {
  void email;
  const { signOut } = useSession();
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Unable to sign in.</h1>
        <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
