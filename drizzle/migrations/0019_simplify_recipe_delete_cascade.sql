CREATE OR REPLACE FUNCTION public.recipe_delete_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.share_link SET revoked_at = now()
   WHERE recipe_id = OLD.id AND revoked_at IS NULL;
  UPDATE public.audit_log SET recipe_id = NULL WHERE recipe_id = OLD.id;
  RETURN OLD;
END; $$;