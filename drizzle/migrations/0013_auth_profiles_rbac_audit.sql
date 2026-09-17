-- 1. Profile names unique per user
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_unique_name
  ON public.user_profiles (user_id, lower(display_name));

-- 2. Which profile a user is currently acting as (used for audit attribution)
CREATE TABLE IF NOT EXISTS public.active_profile (
  user_id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_profile TO authenticated;
GRANT ALL ON public.active_profile TO service_role;
ALTER TABLE public.active_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "active profile own" ON public.active_profile;
CREATE POLICY "active profile own" ON public.active_profile FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.owns_profile(profile_id));

-- 3. Audit records the acting person's email and their active profile name
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_profile text;
  v_action text;
  v_entity uuid;
  v_changes jsonb;
BEGIN
  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  SELECT up.display_name INTO v_profile
    FROM public.active_profile ap
    JOIN public.user_profiles up ON up.id = ap.profile_id
   WHERE ap.user_id = auth.uid();

  IF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity := OLD.id;
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity := NEW.id;
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSE
    v_action := 'create';
    v_entity := NEW.id;
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  END IF;

  INSERT INTO public.audit_log (user_id, action, detail, entity_type, entity_id,
                                actor_email, actor_profile_name, changes_json)
  VALUES (COALESCE(auth.uid(), public.workspace_id()),
          TG_TABLE_NAME || '.' || v_action,
          '{}'::jsonb, TG_TABLE_NAME, v_entity, v_email, v_profile, v_changes);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $function$;

-- audit RDA settings too
DROP TRIGGER IF EXISTS audit_rda_settings ON public.rda_settings;
CREATE TRIGGER audit_rda_settings AFTER INSERT OR UPDATE OR DELETE ON public.rda_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- 4. Lock the data down again: signed-in approved members only
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('master_items','master_item_pins','projects','recipes','recipe_versions',
                        'rda_settings','ingredients','audit_log','share_link','access_config',
                        'profiles','user_roles')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

REVOKE ALL ON public.master_items, public.master_item_pins, public.projects, public.recipes,
  public.recipe_versions, public.rda_settings, public.ingredients, public.audit_log,
  public.share_link, public.access_config, public.profiles, public.user_roles FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_items, public.master_item_pins,
  public.projects, public.recipes, public.recipe_versions, public.rda_settings,
  public.share_link, public.access_config, public.user_roles TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT SELECT ON public.ingredients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

CREATE POLICY "master read" ON public.master_items FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "master insert" ON public.master_items FOR INSERT TO authenticated
  WITH CHECK (public.is_member() AND is_locked = false);
CREATE POLICY "master update" ON public.master_items FOR UPDATE TO authenticated
  USING (public.is_member() AND is_locked = false) WITH CHECK (public.is_member() AND is_locked = false);
CREATE POLICY "master delete" ON public.master_items FOR DELETE TO authenticated
  USING (public.is_member() AND is_locked = false);

CREATE POLICY "pins all" ON public.master_item_pins FOR ALL TO authenticated
  USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "projects all" ON public.projects FOR ALL TO authenticated
  USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "recipes all" ON public.recipes FOR ALL TO authenticated
  USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "recipe versions all" ON public.recipe_versions FOR ALL TO authenticated
  USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "rda all" ON public.rda_settings FOR ALL TO authenticated
  USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "ingredients read" ON public.ingredients FOR SELECT TO authenticated USING (public.is_member());

CREATE POLICY "audit read" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "audit insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_member());

CREATE POLICY "share select" ON public.share_link FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "share insert" ON public.share_link FOR INSERT TO authenticated WITH CHECK (public.is_member());
CREATE POLICY "share update" ON public.share_link FOR UPDATE TO authenticated
  USING (public.is_member()) WITH CHECK (public.is_member());

-- access rules: admins manage, members may read (to know their own status)
CREATE POLICY "access read" ON public.access_config FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "access insert" ON public.access_config FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "access delete" ON public.access_config FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "profile self select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profile self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "roles select" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "roles insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "roles delete" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin());