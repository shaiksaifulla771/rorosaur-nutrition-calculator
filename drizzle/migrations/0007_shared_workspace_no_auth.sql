-- Shared single-workspace mode: no user accounts. All rows belong to a fixed workspace id.
-- Sentinel workspace owner used as the default for every user_id column.
CREATE OR REPLACE FUNCTION public.workspace_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

ALTER TABLE public.recipes         ALTER COLUMN user_id SET DEFAULT public.workspace_id();
ALTER TABLE public.recipe_versions ALTER COLUMN user_id SET DEFAULT public.workspace_id();
ALTER TABLE public.projects        ALTER COLUMN user_id SET DEFAULT public.workspace_id();
ALTER TABLE public.rda_settings    ALTER COLUMN user_id SET DEFAULT public.workspace_id();
ALTER TABLE public.audit_log       ALTER COLUMN user_id SET DEFAULT public.workspace_id();

-- Merge existing per-account data into the shared workspace.
UPDATE public.recipes         SET user_id = public.workspace_id();
UPDATE public.recipe_versions SET user_id = public.workspace_id();
UPDATE public.projects        SET user_id = public.workspace_id();
UPDATE public.rda_settings    SET user_id = public.workspace_id();
UPDATE public.audit_log       SET user_id = public.workspace_id();
UPDATE public.master_items    SET user_id = public.workspace_id() WHERE user_id IS NOT NULL;

-- Open access for the anonymous (no-login) client.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes, public.recipe_versions, public.projects, public.rda_settings, public.master_items, public.audit_log TO anon, authenticated;
GRANT SELECT ON public.ingredients TO anon, authenticated;

DROP POLICY IF EXISTS "own recipes" ON public.recipes;
CREATE POLICY "workspace recipes" ON public.recipes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own recipe versions" ON public.recipe_versions;
CREATE POLICY "workspace recipe versions" ON public.recipe_versions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own projects" ON public.projects;
CREATE POLICY "workspace projects" ON public.projects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own rda" ON public.rda_settings;
CREATE POLICY "workspace rda" ON public.rda_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "own audit insert" ON public.audit_log;
DROP POLICY IF EXISTS "own audit select" ON public.audit_log;
CREATE POLICY "workspace audit insert" ON public.audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "workspace audit select" ON public.audit_log FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "ingredients readable by signed in users" ON public.ingredients;
CREATE POLICY "ingredients readable" ON public.ingredients FOR SELECT TO anon, authenticated USING (true);

-- Master data: built-ins (is_locked) stay read-only; custom items are editable by everyone.
DROP POLICY IF EXISTS "master select builtin or own" ON public.master_items;
DROP POLICY IF EXISTS "master insert own" ON public.master_items;
DROP POLICY IF EXISTS "master update own" ON public.master_items;
DROP POLICY IF EXISTS "master delete own" ON public.master_items;
CREATE POLICY "master select all" ON public.master_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "master insert custom" ON public.master_items FOR INSERT TO anon, authenticated WITH CHECK (is_locked = false AND user_id IS NOT NULL);
CREATE POLICY "master update custom" ON public.master_items FOR UPDATE TO anon, authenticated USING (is_locked = false AND user_id IS NOT NULL) WITH CHECK (is_locked = false AND user_id IS NOT NULL);
CREATE POLICY "master delete custom" ON public.master_items FOR DELETE TO anon, authenticated USING (is_locked = false AND user_id IS NOT NULL);