CREATE TABLE public.shoe_split_videos (
  commercial_name text PRIMARY KEY,
  video_filename text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shoe_split_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read split videos"
ON public.shoe_split_videos
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_shoe_split_videos_updated_at
BEFORE UPDATE ON public.shoe_split_videos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();