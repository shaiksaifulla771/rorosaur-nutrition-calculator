CREATE TABLE public.master_item_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT public.workspace_id(),
  item_id uuid NOT NULL REFERENCES public.master_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX master_item_pins_user_idx ON public.master_item_pins (user_id);
CREATE INDEX master_item_pins_item_idx ON public.master_item_pins (item_id);

GRANT SELECT, INSERT, DELETE ON public.master_item_pins TO anon, authenticated;
GRANT ALL ON public.master_item_pins TO service_role;

ALTER TABLE public.master_item_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace pins select" ON public.master_item_pins FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "workspace pins insert" ON public.master_item_pins FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "workspace pins delete" ON public.master_item_pins FOR DELETE TO anon, authenticated USING (true);

INSERT INTO public.master_item_pins (user_id, item_id)
SELECT public.workspace_id(), id FROM public.master_items WHERE is_pinned = true
ON CONFLICT DO NOTHING;