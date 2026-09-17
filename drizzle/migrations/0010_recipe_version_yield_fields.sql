ALTER TABLE public.recipe_versions
  ADD COLUMN IF NOT EXISTS water_content_g numeric,
  ADD COLUMN IF NOT EXISTS yield_pct numeric,
  ADD COLUMN IF NOT EXISTS cooking_loss_pct numeric,
  ADD COLUMN IF NOT EXISTS changes jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill derived yield/moisture figures for versions that already have a cooked weight.
UPDATE public.recipe_versions v
SET
  water_content_g = CASE
    WHEN v.actual_output_g IS NOT NULL
      AND (v.totals->>'totalGrams') IS NOT NULL
      AND (v.totals->>'totalGrams')::numeric > 0
    THEN round((v.actual_output_g - (v.totals->>'totalGrams')::numeric)::numeric, 2)
    ELSE v.water_content_g END,
  yield_pct = CASE
    WHEN v.actual_output_g IS NOT NULL
      AND (v.totals->>'totalGrams') IS NOT NULL
      AND (v.totals->>'totalGrams')::numeric > 0
    THEN round((v.actual_output_g / (v.totals->>'totalGrams')::numeric * 100)::numeric, 2)
    ELSE v.yield_pct END,
  cooking_loss_pct = CASE
    WHEN v.actual_output_g IS NOT NULL
      AND (v.totals->>'totalGrams') IS NOT NULL
      AND (v.totals->>'totalGrams')::numeric > 0
      AND v.actual_output_g < (v.totals->>'totalGrams')::numeric
    THEN round(((1 - v.actual_output_g / (v.totals->>'totalGrams')::numeric) * 100)::numeric, 2)
    ELSE v.cooking_loss_pct END
WHERE v.actual_output_g IS NOT NULL;

CREATE INDEX IF NOT EXISTS recipe_versions_recipe_id_idx ON public.recipe_versions (recipe_id);
CREATE INDEX IF NOT EXISTS recipes_project_id_idx ON public.recipes (project_id);