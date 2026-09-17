CREATE OR REPLACE FUNCTION public.ensure_access_role()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_email IN ('pranathimaddimsetti@gmail.com', 'sandeep@rorosaur.com', 'shaiksaifulla771@gmail.com') THEN
    v_role := 'admin';
  ELSIF split_part(v_email, '@', 2) = 'rorosaur.com' THEN
    v_role := 'user';
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.auth_registration_authorizations (email, intended_role, confirmed_at)
  VALUES (v_email, v_role, now())
  ON CONFLICT (email) DO UPDATE
    SET intended_role = EXCLUDED.intended_role,
        confirmed_at = COALESCE(public.auth_registration_authorizations.confirmed_at, EXCLUDED.confirmed_at);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN v_role::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_access_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_access_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_access_role() TO service_role;