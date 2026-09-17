-- 1) Audit trail can no longer be written by clients; only the SECURITY DEFINER
--    trigger (which runs as owner and bypasses RLS) may insert rows.
DROP POLICY IF EXISTS "audit insert" ON public.audit_log;
REVOKE INSERT ON public.audit_log FROM authenticated, anon;

-- 2) Lock down EXECUTE on SECURITY DEFINER helpers that no client or policy calls.
REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.block_ingredient_in_use() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.grant_role_from_access_config() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prune_audit_log() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.recipe_delete_cascade() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_global_profile_cap() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_cap() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_default_project() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_locked_master_items() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.recipes_project_fallback() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.total_profile_count() FROM anon, authenticated, public;

-- 3) Helpers used by RLS policies / client RPCs: signed-in only, never anonymous.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_member() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.owns_profile(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.session_verified() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.otp_required() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ensure_access_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.default_project_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.workspace_id() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.session_verified() TO authenticated;
GRANT EXECUTE ON FUNCTION public.otp_required() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_access_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.default_project_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_id() TO authenticated;