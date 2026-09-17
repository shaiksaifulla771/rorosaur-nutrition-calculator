import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthenticatedShell } from "@/components/auth/AuthenticatedShell";
import { supabase } from "@/integrations/supabase/client";

/**
 * Protected shell. Sign-in is checked before render; approval (role), and for
 * normal users a selected profile, are checked once the session context loads.
 * The database enforces the same rules, so the UI gate is never the only guard.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Local session read: no network hop before the shell renders. Every read
    // inside the shell is still authorised server-side by RLS.
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) throw redirect({ to: "/auth", search: { redirect: "/dashboard" } });
    return { user };
  },
  component: AuthenticatedShell,
});
