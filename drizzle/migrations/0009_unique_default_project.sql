CREATE UNIQUE INDEX IF NOT EXISTS projects_single_default_idx
  ON public.projects (user_id)
  WHERE lower(name) = 'default';