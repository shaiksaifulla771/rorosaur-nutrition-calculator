CREATE TABLE public.rda_settings (
  age_band text PRIMARY KEY,
  nutrients jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rda_settings TO anon, authenticated;
GRANT ALL ON public.rda_settings TO service_role;
ALTER TABLE public.rda_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rda settings open" ON public.rda_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.rda_settings;

ALTER TABLE public.recipe_versions
  ADD COLUMN actual_output_g numeric,
  ADD COLUMN serving_size_g numeric;