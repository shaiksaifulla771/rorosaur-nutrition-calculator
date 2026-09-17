-- Permanent "Default" project folder + protection triggers

-- 1. Ensure the Default project exists (one per workspace)
CREATE UNIQUE INDEX IF NOT EXISTS projects_default_unique_idx
  ON public.projects (user_id) WHERE lower(name) = 'default';

INSERT INTO public.projects (user_id, name, description)
SELECT public.workspace_id(), 'Default', 'Default folder for unassigned formulations'
WHERE NOT EXISTS (
  SELECT 1 FROM public.projects WHERE user_id = public.workspace_id() AND lower(name) = 'default'
);

-- 2. Helper returning the Default project id (creating it if missing)
CREATE OR REPLACE FUNCTION public.default_project_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE pid uuid;
BEGIN
  SELECT id INTO pid FROM public.projects
   WHERE user_id = public.workspace_id() AND lower(name) = 'default' LIMIT 1;
  IF pid IS NULL THEN
    INSERT INTO public.projects (user_id, name, description)
    VALUES (public.workspace_id(), 'Default', 'Default folder for unassigned formulations')
    RETURNING id INTO pid;
  END IF;
  RETURN pid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.default_project_id() TO anon, authenticated, service_role;

-- 3. Protect the Default project from deletion/rename
CREATE OR REPLACE FUNCTION public.protect_default_project()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF lower(OLD.name) = 'default' THEN
      RAISE EXCEPTION 'The Default project folder cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF lower(OLD.name) = 'default' AND lower(NEW.name) <> 'default' THEN
    RAISE EXCEPTION 'The Default project folder cannot be renamed.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS projects_protect_default ON public.projects;
CREATE TRIGGER projects_protect_default
  BEFORE UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.protect_default_project();

-- 4. Protect built-in (locked) master items
CREATE OR REPLACE FUNCTION public.protect_locked_master_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_locked THEN
    RAISE EXCEPTION 'Built-in master items are read-only.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS master_items_protect_locked ON public.master_items;
CREATE TRIGGER master_items_protect_locked
  BEFORE UPDATE OR DELETE ON public.master_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_locked_master_items();

-- 5. Recipes never stay unassigned: fall back to Default
CREATE OR REPLACE FUNCTION public.recipes_project_fallback()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    NEW.project_id := public.default_project_id();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS recipes_project_fallback ON public.recipes;
CREATE TRIGGER recipes_project_fallback
  BEFORE INSERT OR UPDATE OF project_id ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.recipes_project_fallback();

-- Backfill orphans
UPDATE public.recipes SET project_id = public.default_project_id() WHERE project_id IS NULL;