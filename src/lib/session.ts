import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "user";

export type UserProfile = {
  id: string;
  display_name: string;
  created_at: string;
};

export type SessionContext = {
  userId: string;
  email: string;
  name: string;
  /** null = signed in but not approved for this workspace */
  role: AppRole | null;
  isActive: boolean;
  /** Profiles owned by this login account. */
  profiles: UserProfile[];
  activeProfileId: string | null;
};

/** Everything the app needs to decide what a signed-in person may see. */
export async function loadSessionContext(): Promise<SessionContext | null> {
  // getSession reads the persisted session locally — no network round trip
  // before the screen can render. Every read below is still enforced by RLS.
  const { data: sessionData, error: userErr } = await supabase.auth.getSession();
  if (userErr || !sessionData.session?.user) return null;
  const user = sessionData.session.user;

  // Self-healing approval: grants the role the access rules already allow when
  // the sign-up trigger did not run. Never grants anything to an address that
  // is not on the admin list or an allowed domain. Runs alongside the reads
  // rather than before them, so it never delays first paint.
  const ensureRole = supabase.rpc("ensure_access_role").then(
    () => undefined,
    () => undefined,
  );

  const [roles, account, profiles, active] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("is_active, display_name, email").eq("id", user.id).maybeSingle(),
    supabase
      .from("user_profiles")
      .select("id, display_name, created_at")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("active_profile")
      .select("profile_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  let roleList = (roles.data ?? []).map((r) => r.role as AppRole);
  if (roleList.length === 0) {
    // No role yet: the self-healing grant may still have been in flight.
    await ensureRole;
    const retry = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    roleList = (retry.data ?? []).map((r) => r.role as AppRole);
  }
  const role: AppRole | null = roleList.includes("admin")
    ? "admin"
    : roleList.includes("user")
      ? "user"
      : null;

  return {
    userId: user.id,
    email: user.email ?? account.data?.email ?? "",
    name:
      (user.user_metadata?.["full_name"] as string | undefined) ??
      account.data?.display_name ??
      (user.email ?? "").split("@")[0] ??
      "",
    role,
    isActive: account.data?.is_active ?? true,
    profiles: (profiles.data ?? []) as UserProfile[],
    activeProfileId: active.data?.profile_id ?? null,
  };
}

const NAME_MAX = 40;

export function profileNameError(name: string, existing: UserProfile[], selfId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a profile name";
  if (trimmed.length > NAME_MAX) return `Use at most ${NAME_MAX} characters`;
  const clash = existing.some(
    (p) => p.id !== selfId && p.display_name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return "A profile with this name already exists";
  return null;
}

export async function createProfile(name: string): Promise<UserProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in again to continue");
  const { data, error } = await supabase
    .from("user_profiles")
    .insert({ display_name: name.trim(), user_id: userData.user.id })
    .select("id, display_name, created_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("A profile with this name already exists");
    throw error;
  }
  return data as UserProfile;
}

export async function selectProfile(userId: string, profileId: string) {
  const { error } = await supabase
    .from("active_profile")
    .upsert(
      { user_id: userId, profile_id: profileId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export async function clearActiveProfile(userId: string) {
  await supabase.from("active_profile").delete().eq("user_id", userId);
}
