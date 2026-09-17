CREATE OR REPLACE FUNCTION public.total_profile_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.user_profiles;
$$;

REVOKE ALL ON FUNCTION public.total_profile_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.total_profile_count() TO authenticated;