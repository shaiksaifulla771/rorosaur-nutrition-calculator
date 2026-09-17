-- The app runs as a single shared workspace with no user accounts, but the
-- policies still required an authenticated "member", so every read failed.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('master_items','master_item_pins','projects','recipes',
                        'recipe_versions','rda_settings','ingredients','audit_log','share_link')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- master data: everyone in the workspace reads; only unlocked custom rows are writable
CREATE POLICY "master read" ON public.master_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "master insert" ON public.master_items FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = public.workspace_id() AND is_locked = false);
CREATE POLICY "master update" ON public.master_items FOR UPDATE TO anon, authenticated
  USING (user_id = public.workspace_id() AND is_locked = false)
  WITH CHECK (user_id = public.workspace_id() AND is_locked = false);
CREATE POLICY "master delete" ON public.master_items FOR DELETE TO anon, authenticated
  USING (user_id = public.workspace_id() AND is_locked = false);

CREATE POLICY "pins all" ON public.master_item_pins FOR ALL TO anon, authenticated
  USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

CREATE POLICY "projects all" ON public.projects FOR ALL TO anon, authenticated
  USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

CREATE POLICY "recipes all" ON public.recipes FOR ALL TO anon, authenticated
  USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

CREATE POLICY "recipe versions all" ON public.recipe_versions FOR ALL TO anon, authenticated
  USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

CREATE POLICY "rda all" ON public.rda_settings FOR ALL TO anon, authenticated
  USING (user_id = public.workspace_id()) WITH CHECK (user_id = public.workspace_id());

CREATE POLICY "ingredients read" ON public.ingredients FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "audit read" ON public.audit_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audit insert" ON public.audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "share read" ON public.share_link FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "share insert" ON public.share_link FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "share update" ON public.share_link FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.master_items, public.ingredients, public.audit_log, public.share_link TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_items, public.master_item_pins, public.projects,
  public.recipes, public.recipe_versions, public.rda_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.share_link TO anon, authenticated;
GRANT SELECT, INSERT ON public.audit_log TO anon, authenticated;
GRANT SELECT ON public.ingredients TO anon, authenticated;
GRANT ALL ON public.master_items, public.master_item_pins, public.projects, public.recipes,
  public.recipe_versions, public.rda_settings, public.audit_log, public.share_link, public.ingredients TO service_role;