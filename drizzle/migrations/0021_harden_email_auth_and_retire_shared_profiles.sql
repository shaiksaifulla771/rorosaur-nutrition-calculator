CREATE OR REPLACE FUNCTION public.grant_role_from_access_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(NEW.email));
  v_role public.app_role;
BEGIN
  IF NEW.email_confirmed_at IS NULL OR v_email IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_email IN ('developer@lywo.in', 'sandeep@rorosaur.com') THEN
    v_role := 'admin';
  ELSIF split_part(v_email, '@', 2) = 'rorosaur.com' THEN
    v_role := 'user';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.auth_registration_authorizations (email, intended_role, confirmed_at)
  VALUES (v_email, v_role, now())
  ON CONFLICT (email) DO UPDATE
    SET intended_role = EXCLUDED.intended_role,
        confirmed_at = COALESCE(public.auth_registration_authorizations.confirmed_at, EXCLUDED.confirmed_at);

  DELETE FROM public.user_roles
  WHERE user_id = NEW.id AND role <> v_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.display_name := btrim(NEW.display_name);
  IF NEW.display_name = '' OR char_length(NEW.display_name) > 40 THEN
    RAISE EXCEPTION 'Enter a profile name between 1 and 40 characters.';
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "workspace profiles read" ON public.workspace_profiles;
DROP POLICY IF EXISTS "workspace profiles insert" ON public.workspace_profiles;
DROP POLICY IF EXISTS "workspace profiles update" ON public.workspace_profiles;
DROP POLICY IF EXISTS "workspace profiles delete" ON public.workspace_profiles;
REVOKE ALL ON public.workspace_profiles FROM anon, authenticated;

DROP POLICY IF EXISTS "active workspace profile own" ON public.active_workspace_profile;
REVOKE ALL ON public.active_workspace_profile FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_owner_name_unique
  ON public.user_profiles (user_id, lower(btrim(display_name)));

CREATE INDEX IF NOT EXISTS password_reset_approvals_created_idx
  ON public.password_reset_approvals (target_user_id, created_at DESC);