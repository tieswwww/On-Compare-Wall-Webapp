-- Split-video setup for on-showroom-data. Run this in the Supabase SQL editor
-- (project dlcogzpcduadrshlxqrr). The 12 .webm files are already uploaded to the
-- shoe-assets bucket under splits/ (opus_tsc uploaded them via the storage API).
--
-- After this runs: the admin build (getShoeCatalog) AND the kiosk build
-- (getCatalogFromView, anon) both resolve split videos to PUBLIC URLs:
--   https://dlcogzpcduadrshlxqrr.supabase.co/storage/v1/object/public/shoe-assets/splits/<file>
-- See src/lib/split-videos.ts.

-- 1) Make the shoe-assets bucket public-read. Split clips are shoe marketing
--    assets (not sensitive); public lets the anon kiosk play them without
--    service-role signing, and makes them cacheable for offline.
update storage.buckets set public = true where id = 'shoe-assets';

-- 2) Let the anon role read the split-video mapping. The kiosk reads this table
--    with the publishable key to build the public URLs. (RLS already enabled;
--    there's already an "authenticated" read policy for the admin build.)
drop policy if exists "Anon can read split video map" on public.shoe_split_videos;
create policy "Anon can read split video map"
  on public.shoe_split_videos for select to anon using (true);

-- 3) Populate the 12 split videos (commercial_name must match compare_wall exactly).
insert into public.shoe_split_videos (commercial_name, video_filename) values
  ('Cloudboom Max',                   'CloudboomMax-alpha.webm'),
  ('Cloudboom Strike 2',              'CloudboomStrike2-alpha.webm'),
  ('Cloudsurfer 3',                   'Cloudsurfer3-alpha.webm'),
  ('Cloudsurfer Max',                 'CloudsurferMax-alpha.webm'),
  ('Cloudrunner 3',                   'Clourdrunner3-alpha.webm'),
  ('Cloudrunner 3 Max',               'Cloudrunner3Max-alpha.webm'),
  ('Cloudflow 6',                     'Cloudflow6-alpha.webm'),
  ('Cloudmonster 3',                  'Cloudmonster3-alpha.webm'),
  ('Cloudmonster 3 Hyper',            'Cloudmonster3Hyper-alpha.webm'),
  ('LightSpray Cloudboom Strike 2',   'LSCloudboomStrike2-alpha.webm'),
  ('LightSpray Cloudboom Volt 2',     'LSCloudboomVolt2-alpha.webm'),
  ('LightSpray Cloudmonster 3 Hyper', 'LSCloudmonster3Hyper-alpha.webm')
on conflict (commercial_name) do update set
  video_filename = excluded.video_filename,
  updated_at = now();
