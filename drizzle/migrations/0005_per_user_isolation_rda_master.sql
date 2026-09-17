-- ===== RDA settings: per user =====
ALTER TABLE public.rda_settings ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.rda_settings ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
UPDATE public.rda_settings SET user_id = '248a0c51-4c3f-4a96-99b2-8463a71d510a' WHERE user_id IS NULL;
ALTER TABLE public.rda_settings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.rda_settings DROP CONSTRAINT IF EXISTS rda_settings_pkey;
ALTER TABLE public.rda_settings ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS rda_settings_user_band_uq ON public.rda_settings (user_id, age_band);
DROP POLICY IF EXISTS "rda settings open" ON public.rda_settings;
REVOKE ALL ON public.rda_settings FROM anon;
CREATE POLICY "own rda" ON public.rda_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== Master items: built-ins shared (user_id null), custom per user =====
ALTER TABLE public.master_items ADD COLUMN IF NOT EXISTS user_id uuid;
UPDATE public.master_items SET user_id = '248a0c51-4c3f-4a96-99b2-8463a71d510a' WHERE source = 'custom' AND user_id IS NULL;
UPDATE public.master_items SET is_locked = true WHERE source <> 'custom';
CREATE INDEX IF NOT EXISTS master_items_user_idx ON public.master_items (user_id);
DROP POLICY IF EXISTS "master items open" ON public.master_items;
REVOKE ALL ON public.master_items FROM anon;
CREATE POLICY "master select builtin or own" ON public.master_items FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "master insert own" ON public.master_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND is_locked = false);
CREATE POLICY "master update own" ON public.master_items FOR UPDATE TO authenticated USING (user_id = auth.uid() AND is_locked = false) WITH CHECK (user_id = auth.uid() AND is_locked = false);
CREATE POLICY "master delete own" ON public.master_items FOR DELETE TO authenticated USING (user_id = auth.uid() AND is_locked = false);

-- ===== Projects =====
UPDATE public.projects SET user_id = '248a0c51-4c3f-4a96-99b2-8463a71d510a' WHERE user_id IS NULL;
ALTER TABLE public.projects ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.projects ALTER COLUMN user_id SET NOT NULL;
DROP POLICY IF EXISTS "projects open" ON public.projects;
REVOKE ALL ON public.projects FROM anon;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== Recipes =====
UPDATE public.recipes SET user_id = '248a0c51-4c3f-4a96-99b2-8463a71d510a' WHERE user_id IS NULL;
ALTER TABLE public.recipes ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.recipes ALTER COLUMN user_id SET NOT NULL;
DROP POLICY IF EXISTS "recipes open" ON public.recipes;
REVOKE ALL ON public.recipes FROM anon;
CREATE POLICY "own recipes" ON public.recipes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- deleting a project keeps recipes
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_project_id_fkey;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- ===== Recipe versions =====
UPDATE public.recipe_versions SET user_id = '248a0c51-4c3f-4a96-99b2-8463a71d510a' WHERE user_id IS NULL;
ALTER TABLE public.recipe_versions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE public.recipe_versions ALTER COLUMN user_id SET NOT NULL;
DROP POLICY IF EXISTS "recipe versions open" ON public.recipe_versions;
REVOKE ALL ON public.recipe_versions FROM anon;
CREATE POLICY "own recipe versions" ON public.recipe_versions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ===== Audit log =====
UPDATE public.audit_log SET user_id = '248a0c51-4c3f-4a96-99b2-8463a71d510a' WHERE user_id IS NULL;
DROP POLICY IF EXISTS "audit open insert" ON public.audit_log;
DROP POLICY IF EXISTS "audit open select" ON public.audit_log;
REVOKE ALL ON public.audit_log FROM anon;
CREATE POLICY "own audit select" ON public.audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own audit insert" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);