CREATE OR REPLACE FUNCTION public.account_has_password(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE lower(u.email) = lower(_email)
      AND u.encrypted_password IS NOT NULL
      AND u.encrypted_password <> ''
  )
$$;

REVOKE ALL ON FUNCTION public.account_has_password(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.account_has_password(text) FROM anon;
REVOKE ALL ON FUNCTION public.account_has_password(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.account_has_password(text) TO service_role;