import { Outlet, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { ProfileGate } from "@/components/auth/ProfileGate";
import { SessionProvider, useSession } from "@/hooks/useSession";

/**
 * Provider + gate live in one plain component module so the route's code-split
 * component never ends up with a second copy of the session context.
 */
export function AuthenticatedShell() {
  return (
    <SessionProvider>
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const { session, isLoading, isAdmin } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center" aria-busy>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session.role || !session.isActive) return <AccessDenied email={session.email} />;

  const needsProfile = !isAdmin && !session.activeProfileId;
  if (needsProfile) return <ProfileGate profiles={session.profiles} />;

  if (!isAdmin && pathname.startsWith("/admin")) {
    return (
      <AppShell>
        <div
          role="alert"
          className="mx-auto mt-10 max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
        >
          <h2 className="text-base font-semibold">Admins only</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don't have permission to open this area.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
