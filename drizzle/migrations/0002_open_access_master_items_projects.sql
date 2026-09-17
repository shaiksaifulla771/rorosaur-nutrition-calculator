-- Master data: user-managed food items (per 100 g nutrients, amino acids mg/g protein)
CREATE TABLE public.master_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  nutrients jsonb NOT NULL DEFAULT '{}'::jsonb,
  amino_acids jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_items TO anon, authenticated;
GRANT ALL ON public.master_items TO service_role;
ALTER TABLE public.master_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "master items open" ON public.master_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX master_items_name_idx ON public.master_items (lower(name));

-- Projects: description + open access
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.projects ALTER COLUMN user_id DROP NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO anon, authenticated;
DROP POLICY IF EXISTS "own projects" ON public.projects;
CREATE POLICY "projects open" ON public.projects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Recipes: open access (no login)
ALTER TABLE public.recipes ALTER COLUMN user_id DROP NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO anon, authenticated;
DROP POLICY IF EXISTS "own recipes" ON public.recipes;
CREATE POLICY "recipes open" ON public.recipes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Recipe versions: open access
ALTER TABLE public.recipe_versions ALTER COLUMN user_id DROP NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_versions TO anon, authenticated;
DROP POLICY IF EXISTS "own recipe versions" ON public.recipe_versions;
CREATE POLICY "recipe versions open" ON public.recipe_versions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Audit log: open insert/select
ALTER TABLE public.audit_log ALTER COLUMN user_id DROP NOT NULL;
GRANT SELECT, INSERT ON public.audit_log TO anon, authenticated;
DROP POLICY IF EXISTS "own audit insert" ON public.audit_log;
DROP POLICY IF EXISTS "own audit select" ON public.audit_log;
CREATE POLICY "audit open insert" ON public.audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "audit open select" ON public.audit_log FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.master_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;