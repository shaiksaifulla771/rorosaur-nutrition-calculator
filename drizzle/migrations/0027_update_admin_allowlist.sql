CREATE OR REPLACE FUNCTION public.ensure_access_role()
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

  IF v_role = 'admin' AND v_email NOT IN ('pranathimaddimsetti@gmail.com', 'sandeep@rorosaur.com', 'shaiksaifulla771@gmail.com') THEN
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

  IF v_email IN ('pranathimaddimsetti@gmail.com', 'sandeep@rorosaur.com', 'shaiksaifulla771@gmail.com') THEN
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
