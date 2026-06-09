-- ============================================================================
-- ON Compare Wall — app operational backend, to run on `on-showroom-data`
-- ============================================================================
-- Context: the app's home DB is being consolidated into `on-showroom-data`
-- (ref dlcogzpcduadrshlxqrr). The product CATALOG is already there as the
-- `compare_wall` view (the app reads it directly). This script adds the app's
-- OPERATIONAL objects, which do NOT exist there yet:
--   shoe_slots, shoe_events, shoe_split_videos, the private shoe-assets bucket,
--   Realtime on shoe_slots + the shoe-events broadcast policy, and RLS.
--
-- NOT created here (on purpose):
--   - `shoes` catalog table  → the app reads `compare_wall` instead.
--   - `shoe_image_urls`      → legacy/unused by the current code.
--
-- Auth users (`viewer@local.app`, `node-red@local.app`) are created
-- automatically by the app on first login via the service-role key — no SQL.
--
-- Safe to re-run (idempotent). Review before applying. Owner of this DB is
-- opus_ties — apply via your normal migration flow, not by opus_tsc directly.
-- ============================================================================

-- shared updated_at trigger function -----------------------------------------
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;

-- shoe_slots: the wall's live left/right state -------------------------------
create table if not exists public.shoe_slots (
  side       text primary key check (side in ('left','right')),
  ean        text,
  updated_at timestamptz not null default now()
);

insert into public.shoe_slots (side, ean)
values ('left', null), ('right', null)
on conflict (side) do nothing;

alter table public.shoe_slots enable row level security;

drop policy if exists "Authenticated can read shoe slots" on public.shoe_slots;
create policy "Authenticated can read shoe slots"
  on public.shoe_slots for select to authenticated using (true);

-- Realtime: publish shoe_slots + full row image (idempotent add).
alter table public.shoe_slots replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shoe_slots'
  ) then
    alter publication supabase_realtime add table public.shoe_slots;
  end if;
end $$;

-- shoe_events: append-only audit log -----------------------------------------
create table if not exists public.shoe_events (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  side         text,
  ean          text,
  previous_ean text,
  raw          jsonb,
  created_at   timestamptz not null default now()
);

alter table public.shoe_events enable row level security;

drop policy if exists "Authenticated can read shoe events" on public.shoe_events;
create policy "Authenticated can read shoe events"
  on public.shoe_events for select to authenticated using (true);

-- shoe_split_videos: shoe → demo video file in the shoe-assets bucket --------
create table if not exists public.shoe_split_videos (
  commercial_name text primary key,
  video_filename  text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.shoe_split_videos enable row level security;

drop policy if exists "Authenticated can read split videos" on public.shoe_split_videos;
create policy "Authenticated can read split videos"
  on public.shoe_split_videos for select to authenticated using (true);

drop trigger if exists update_shoe_split_videos_updated_at on public.shoe_split_videos;
create trigger update_shoe_split_videos_updated_at
  before update on public.shoe_split_videos
  for each row execute function public.update_updated_at_column();

-- Private storage bucket for split videos (signed URLs only) -----------------
insert into storage.buckets (id, name, public)
values ('shoe-assets', 'shoe-assets', false)
on conflict (id) do nothing;

drop policy if exists "Deny direct access to shoe-assets for anon" on storage.objects;
create policy "Deny direct access to shoe-assets for anon"
  on storage.objects for select to anon using (false);

drop policy if exists "Deny direct access to shoe-assets for authenticated" on storage.objects;
create policy "Deny direct access to shoe-assets for authenticated"
  on storage.objects for select to authenticated using (bucket_id <> 'shoe-assets');

-- Realtime: allow authenticated to subscribe to the shoe-events broadcast ----
drop policy if exists "Authenticated can subscribe to shoe-events" on realtime.messages;
create policy "Authenticated can subscribe to shoe-events"
  on realtime.messages for select to authenticated
  using ((realtime.topic() = 'shoe-events') and (extension = 'broadcast'));
