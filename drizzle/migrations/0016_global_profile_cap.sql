CREATE OR REPLACE FUNCTION public.enforce_profile_cap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT count(*) FROM public.user_profiles) >= 50 THEN
    RAISE EXCEPTION 'PROFILE_GLOBAL_CAP';
  END IF;
  IF (SELECT count(*) FROM public.user_profiles WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'You can have at most 5 profiles.';
  END IF;
  RETURN NEW;
END;
$$;