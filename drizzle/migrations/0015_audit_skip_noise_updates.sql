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