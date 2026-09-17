import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device";
import { endVerifiedSession } from "@/lib/otp.functions";
import {
  clearActiveProfile,
  loadSessionContext,
  selectProfile,
  type SessionContext,
} from "@/lib/session";

export const sessionQueryKey = ["session-context"] as const;

type SessionValue = {
  session: SessionContext | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  chooseProfile: (profileId: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: sessionQueryKey,
    queryFn: loadSessionContext,
    staleTime: 30_000,
  });

  const session = data ?? null;

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
  }, [queryClient]);

  const chooseProfile = useCallback(
    async (profileId: string) => {
      if (!session) return;
      await selectProfile(session.userId, profileId);
      // Update from what we already know so the workspace opens at once; the
      // background revalidation keeps the cache honest.
      queryClient.setQueryData<SessionContext>(sessionQueryKey, (prev) =>
        prev ? { ...prev, activeProfileId: profileId } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
    [session, queryClient],
  );

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    if (session) await clearActiveProfile(session.userId);
    try {
      // Signing out ends the verification for this browser, so the next sign-in
      // asks for a fresh one-time code.
      await endVerifiedSession({ data: { deviceId: getDeviceId() } });
    } catch {
      /* signing out must never be blocked by this cleanup */
    }
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { redirect: "/dashboard" }, replace: true });
  }, [queryClient, navigate, session]);

  const value = useMemo<SessionValue>(
    () => ({
      session,
      isLoading,
      refresh,
      chooseProfile,
      signOut,
      isAdmin: session?.role === "admin",
    }),
    [session, isLoading, refresh, chooseProfile, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
