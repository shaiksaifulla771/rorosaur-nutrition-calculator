CREATE TABLE public.auth_registration_authorizations (
  email text PRIMARY KEY,
  intended_role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  CONSTRAINT auth_registration_email_normalized CHECK (email = lower(btrim(email)))
);
GRANT ALL ON public.auth_registration_authorizations TO service_role;
ALTER TABLE public.auth_registration_authorizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.password_reset_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  target_email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reset_target_email_normalized CHECK (target_email = lower(btrim(target_email))),
  CONSTRAINT reset_attempts_nonnegative CHECK (attempts >= 0)
);
GRANT ALL ON public.password_reset_approvals TO service_role;
ALTER TABLE public.password_reset_approvals ENABLE ROW LEVEL SECURITY;
CREATE INDEX password_reset_approvals_target_idx ON public.password_reset_approvals (target_user_id, created_at DESC);
CREATE INDEX password_reset_approvals_expiry_idx ON public.password_reset_approvals (expires_at) WHERE consumed_at IS NULL;
CREATE UNIQUE INDEX password_reset_one_pending_per_user
  ON public.password_reset_approvals (target_user_id)
  WHERE approved_at IS NULL AND consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_access_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_role public.app_role;
BEGIN
  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL;

  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT intended_role INTO v_role
  FROM public.auth_registration_authorizations
  WHERE email = v_email;

  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_role = 'admin' AND v_email NOT IN ('developer@lywo.in', 'sandeep@rorosaur.com') THEN
    RETURN NULL;
  END IF;

  IF v_role = 'user' AND split_part(v_email, '@', 2) <> 'rorosaur.com' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.auth_registration_authorizations
  SET confirmed_at = COALESCE(confirmed_at, now())
  WHERE email = v_email;

  RETURN v_role::text;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_access_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_access_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_role_from_access_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(NEW.email);
  v_role public.app_role;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT intended_role INTO v_role
  FROM public.auth_registration_authorizations
  WHERE email = v_email;

  IF v_role = 'admin' AND v_email IN ('developer@lywo.in', 'sandeep@rorosaur.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF v_role = 'user' AND split_part(v_email, '@', 2) = 'rorosaur.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.auth_registration_authorizations
  SET confirmed_at = COALESCE(confirmed_at, now())
  WHERE email = v_email;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "user profiles insert" ON public.user_profiles;
DROP POLICY IF EXISTS "user profiles select" ON public.user_profiles;
DROP POLICY IF EXISTS "user profiles update" ON public.user_profiles;
CREATE POLICY "user profiles insert" ON public.user_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_member());
CREATE POLICY "user profiles select" ON public.user_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "user profiles update" ON public.user_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "active profile own" ON public.active_profile;
CREATE POLICY "active profile own" ON public.active_profile FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.owns_profile(profile_id));

DROP POLICY IF EXISTS "projects all" ON public.projects;
CREATE POLICY "projects read" ON public.projects FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "projects insert" ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_member());
CREATE POLICY "projects update" ON public.projects FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "projects delete admin" ON public.projects FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "recipes all" ON public.recipes;
CREATE POLICY "recipes read" ON public.recipes FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "recipes insert" ON public.recipes FOR INSERT TO authenticated WITH CHECK (public.is_member());
CREATE POLICY "recipes update" ON public.recipes FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "recipes delete admin" ON public.recipes FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "recipe versions all" ON public.recipe_versions;
CREATE POLICY "recipe versions read" ON public.recipe_versions FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "recipe versions insert" ON public.recipe_versions FOR INSERT TO authenticated WITH CHECK (public.is_member());
CREATE POLICY "recipe versions update" ON public.recipe_versions FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "recipe versions delete admin" ON public.recipe_versions FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "master delete" ON public.master_items;
CREATE POLICY "master delete admin" ON public.master_items FOR DELETE TO authenticated
  USING (public.is_admin() AND is_locked = false AND user_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_profile text;
  v_action text;
  v_entity uuid;
  v_changes jsonb;
  v_noise text[] := ARRAY['id','user_id','created_at','updated_at','current_version_id','owner_profile_id'];
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(OLD) - v_noise) = (to_jsonb(NEW) - v_noise) THEN
    RETURN NEW;
  END IF;

  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  SELECT up.display_name INTO v_profile
    FROM public.active_profile ap
    JOIN public.user_profiles up ON up.id = ap.profile_id AND up.user_id = ap.user_id
   WHERE ap.user_id = auth.uid();

  IF public.is_admin() THEN
    v_profile := 'Administrator';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_action := 'delete'; v_entity := OLD.id;
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update'; v_entity := NEW.id;
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSE
    v_action := 'create'; v_entity := NEW.id;
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  END IF;

  INSERT INTO public.audit_log (user_id, action, detail, entity_type, entity_id,
                                actor_email, actor_profile_name, changes_json)
  VALUES (COALESCE(auth.uid(), public.workspace_id()), TG_TABLE_NAME || '.' || v_action,
          '{}'::jsonb, TG_TABLE_NAME, v_entity, v_email, v_profile, v_changes);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;