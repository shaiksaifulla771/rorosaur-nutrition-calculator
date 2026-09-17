-- Per-user isolation indexes: every RLS policy filters on user_id, so these keep queries fast at scale.
CREATE INDEX IF NOT EXISTS recipes_user_idx ON public.recipes USING btree (user_id);
CREATE INDEX IF NOT EXISTS recipes_project_idx ON public.recipes USING btree (project_id);
CREATE INDEX IF NOT EXISTS recipes_user_updated_idx ON public.recipes USING btree (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS recipe_versions_user_idx ON public.recipe_versions USING btree (user_id);
CREATE INDEX IF NOT EXISTS projects_user_idx ON public.projects USING btree (user_id);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON public.audit_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS audit_log_recipe_idx ON public.audit_log USING btree (recipe_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log USING btree (created_at);

-- Audit log control: keep the newest 500 entries per user and nothing older than 180 days.
CREATE OR REPLACE FUNCTION public.prune_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE user_id = NEW.user_id
    AND (
      created_at < now() - interval '180 days'
      OR id IN (
        SELECT id FROM public.audit_log
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        OFFSET 500
      )
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_log_prune ON public.audit_log;
CREATE TRIGGER audit_log_prune
AFTER INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.prune_audit_log();