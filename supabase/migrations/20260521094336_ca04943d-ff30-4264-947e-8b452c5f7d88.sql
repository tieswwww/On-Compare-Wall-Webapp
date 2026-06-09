-- 1. Lock down existing tables
DROP POLICY IF EXISTS "Public can read shoe events" ON public.shoe_events;
DROP POLICY IF EXISTS "Public can read shoe slots" ON public.shoe_slots;

CREATE POLICY "Authenticated can read shoe events"
  ON public.shoe_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read shoe slots"
  ON public.shoe_slots FOR SELECT TO authenticated USING (true);

-- 2. Catalog table
CREATE TABLE public.shoes (
  ean text PRIMARY KEY,
  name text,
  model text,
  colorway text,
  image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read shoes"
  ON public.shoes FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_shoes_updated_at
  BEFORE UPDATE ON public.shoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Signed-URL cache
CREATE TABLE public.shoe_image_urls (
  ean text PRIMARY KEY REFERENCES public.shoes(ean) ON DELETE CASCADE,
  url text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shoe_image_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read image urls"
  ON public.shoe_image_urls FOR SELECT TO authenticated USING (true);

-- 4. Private storage bucket (no policies = only service_role can access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('shoe-assets', 'shoe-assets', false)
ON CONFLICT (id) DO NOTHING;