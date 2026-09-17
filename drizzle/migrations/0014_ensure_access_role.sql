CREATE OR REPLACE FUNCTION public.ensure_access_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_domain text;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT lower(u.email) INTO v_email
    FROM auth.users u
   WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;

  IF v_email IS NULL THEN RETURN NULL; END IF;
  v_domain := split_part(v_email, '@', 2);

  IF EXISTS (SELECT 1 FROM public.access_config
              WHERE kind = 'admin_email' AND lower(value) = v_email) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF EXISTS (SELECT 1 FROM public.access_config
                 WHERE kind = 'allowed_domain' AND lower(value) = v_domain) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  SELECT CASE WHEN bool_or(r.role = 'admin') THEN 'admin'
              WHEN count(*) > 0 THEN 'user' END
    INTO v_role
    FROM public.user_roles r WHERE r.user_id = v_uid;

  RETURN v_role;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_access_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_access_role() TO authenticated;

-- Backfill: approved accounts that were created before/around the rules being
-- applied and therefore never received a role row.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
  FROM auth.users u
  JOIN public.access_config a
    ON a.kind = 'admin_email' AND lower(a.value) = lower(u.email)
 WHERE u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
  FROM auth.users u
  JOIN public.access_config a
    ON a.kind = 'allowed_domain' AND lower(a.value) = lower(split_part(u.email, '@', 2))
 WHERE u.email_confirmed_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;
