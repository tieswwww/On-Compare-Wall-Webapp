
CREATE TABLE public.shoe_slots (
  side TEXT PRIMARY KEY CHECK (side IN ('left','right')),
  ean TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.shoe_slots (side, ean) VALUES ('left', NULL), ('right', NULL);

ALTER TABLE public.shoe_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read shoe slots"
  ON public.shoe_slots FOR SELECT
  USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.shoe_slots;
ALTER TABLE public.shoe_slots REPLICA IDENTITY FULL;

CREATE TABLE public.shoe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  side TEXT,
  ean TEXT,
  previous_ean TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shoe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read shoe events"
  ON public.shoe_events FOR SELECT
  USING (true);
