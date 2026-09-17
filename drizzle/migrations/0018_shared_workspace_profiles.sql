CREATE TABLE public.workspace_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX workspace_profiles_name_uniq ON public.workspace_profiles (lower(display_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_profiles TO authenticated;
GRANT ALL ON public.workspace_profiles TO service_role;

ALTER TABLE public.workspace_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace profiles read" ON public.workspace_profiles
  FOR SELECT TO authenticated USING (public.is_member());
CREATE POLICY "workspace profiles insert" ON public.workspace_profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_member());
CREATE POLICY "workspace profiles update" ON public.workspace_profiles
  FOR UPDATE TO authenticated USING (public.is_member()) WITH CHECK (public.is_member());
CREATE POLICY "workspace profiles delete" ON public.workspace_profiles
  FOR DELETE TO authenticated USING (public.is_member());

INSERT INTO public.workspace_profiles (id, display_name, created_at)
SELECT up.id, up.display_name, up.created_at FROM public.user_profiles up
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.enforce_global_profile_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF (SELECT count(*) FROM public.workspace_profiles) >= 50 THEN
    RAISE EXCEPTION 'PROFILE_GLOBAL_CAP';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_profiles_cap
BEFORE INSERT ON public.workspace_profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_global_profile_cap();

CREATE TABLE public.active_workspace_profile (
  user_id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.workspace_profiles(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.active_workspace_profile TO authenticated;
GRANT ALL ON public.active_workspace_profile TO service_role;

ALTER TABLE public.active_workspace_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "active workspace profile own" ON public.active_workspace_profile
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

INSERT INTO public.active_workspace_profile (user_id, profile_id)
SELECT ap.user_id, ap.profile_id FROM public.active_profile ap
WHERE EXISTS (SELECT 1 FROM public.workspace_profiles wp WHERE wp.id = ap.profile_id)
ON CONFLICT DO NOTHING;

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
  v_noise text[] := ARRAY['id','user_id','created_at','updated_at','current_version_id','owner_profile_id'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD) - v_noise) = (to_jsonb(NEW) - v_noise) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = auth.uid();
  SELECT wp.display_name INTO v_profile
    FROM public.active_workspace_profile ap
    JOIN public.workspace_profiles wp ON wp.id = ap.profile_id
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