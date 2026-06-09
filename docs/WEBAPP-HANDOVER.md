# ON Compare Wall — Web App Reference

> A single, self-contained brain-dump of the **web app**: what it is, how it's
> built, how data flows, the file-by-file layout, how to set it up and run it, and
> what's still open. Written so someone (or an AI) with no prior context can pick it up.
>
> **Updated:** 2026-06-09 (post on-showroom-data consolidation + code-quality pass).
> **Companion docs:** [`LOCAL-SETUP.md`](./LOCAL-SETUP.md) (step-by-step run + gotchas),
> [`on-showroom-data-app-backend.sql`](./on-showroom-data-app-backend.sql) (the DB
> objects this app needs). The hardware/RFID side lives in a separate repo
> (`on-compare-grid`) with its own handover docs; the two AIs coordinate via `AI-CHANNEL.md`.

---

## 0. TL;DR

- **What:** a fullscreen, portrait **kiosk wall** (designed 1080×1920) for in-store. No
  touch, no operator. A scanner tells it which shoe is on the **left** and **right** stand;
  it shows each shoe and a side-by-side compare layout.
- **Chain it sits in:** `RFID tag → reader → Python bridge → THIS APP → screen`. The bridge
  POSTs one webhook per scan; the wall flips in <300 ms.
- **Stack:** TanStack Start (React 19, Vite 7) · Tailwind v4 + shadcn/ui · Supabase
  (Postgres + Auth + Realtime + Storage) · TanStack Query/Router · Cloudflare Workers
  (deploy). Package manager **bun**.
- **Data:** one Supabase project, **`on-showroom-data`** (TSC's, ON-fed). Catalog is read
  from the **`compare_wall`** view (Sample-EAN keyed); the app's operational tables live in
  the same project. The catalog is **prefetched once** at boot and every scan resolves in
  memory.
- **Run it:** `bun install` → `bun run dev` → http://localhost:8080 → open `/?k=<token>`.
- **Status:** runs locally end-to-end with images. Production runtime (TSS Play + local
  MQTT) is the next phase.

---

## 1. What the visitor sees

A 2×2 grid filling a portrait screen — split **left / right** (one shoe per side) and
**top / bottom**:

- **Top quadrant (per side):** a looping **demo video** of the shoe (or, when there's no
  video, the **static product photo** as a fallback), with the shoe **name** + **technology**
  tags anchored beneath.
- **Bottom quadrant (per side):** a two-stage reveal — a **colour drape** in the shoe's sales
  colour drops down, then a **black stat panel** drops over it showing the **experience**
  header, three **bar graphs** (Cushioning / Responsiveness / Stability, 1–5), and data rows
  (Activity, Best For, Ride Type/Feel, Recommended Distance).
- **One shoe only:** the *opposite* empty half shows that shoe's full-height **"key look"
  lookbook image**, which fades + brightens in.
- **Idle:** the On logo, top-right.

**Motion language:** staggered panel drops (colour then black on open; reverse on close),
opacity/blur fades, a brightness ramp on the key look. Key trick — on removal the app keeps
rendering the last shoe briefly so panels animate *out* instead of snapping to empty. All
timings are named in `src/constants/animation.ts`.

**Scaling (non-obvious):** all sizing is computed in **JavaScript** against a fixed 1920px
design height and emitted as plain `Npx` strings. CSS `calc()`/`min()`/length-math are
avoided because the embedded **Chromium in Vuplex** (the kiosk runtime) evaluates them
inconsistently. See `src/hooks/useScaledUnits.ts`.

---

## 2. Architecture & end-to-end flow

```
RFID reader → Python bridge ─┐                         ┌─ Supabase Realtime ("shoe-events")
(or the emulator)            │  POST /api/public/       │       broadcast
                             └─ ingest/shoe-event ──────┤
                                Bearer NODE_RED_PASSWORD │  then persist shoe_slots + shoe_events
                                                         ▼
                                          THE WALL (browser, in Vuplex on the POS)
                                          • subscribes to "shoe-events"
                                          • resolves EAN in the in-memory catalog
                                          • renders the quadrants
```

A scan's life:
1. Bridge/emulator POSTs `{ event_type, side, ean }` to the ingest endpoint with the bearer token.
2. `handleShoeEventIngest` (`src/lib/shoe-event-ingest.server.ts`): verifies the token
   (constant-time), reads the slot's current ean, **broadcasts** on the `shoe-events`
   Realtime channel, then **persists** (`shoe_slots` update + `shoe_events` insert).
3. The wall is subscribed to `shoe-events`; it updates its in-memory `slots`, looks the EAN
   up in the prefetched catalog map, and renders. Removal clears that side.

> **Broadcast before DB write is intentional:** the wall resolves shoes from the in-memory
> catalog + the broadcast payload, not from the DB row, so reacting fast is what matters; the
> `shoe_slots`/`shoe_events` writes are persistence/audit. On a cold load the wall reads
> `shoe_slots` once to catch the current state.

---

## 3. The database — `on-showroom-data`

One Supabase project, **`on-showroom-data`** (ref `dlcogzpcduadrshlxqrr`, Frankfurt). It's
TSC's enriched, ON-fed store; the wall is one consumer of it.

**Catalog (read-only):** the **`compare_wall`** view (~943 rows, keyed by **Sample EAN** — the
barcode real ON tags carry). It's shaped to match what the app reads (see `SHOE_COLUMNS` in
`shoes.functions.ts` / `CatalogRow` in `types/wall.ts`): name, colour, the three 1–5 scales,
experience, ride/activity/distance, technology (comma text), description, usps, the three
image columns, and `lookbook_url`. All joins / array→text shaping happen **in the view** — the
app only reads + displays.

**Operational objects** (created by [`on-showroom-data-app-backend.sql`](./on-showroom-data-app-backend.sql)):

| Object | Role |
|---|---|
| `shoe_slots` (2 rows) | live left/right state; in the Realtime publication |
| `shoe_events` | append-only audit log of every scan |
| `shoe_split_videos` | shoe `commercial_name` → demo video filename in the bucket |
| storage bucket `shoe-assets` (private) | split videos; served via short-lived signed URLs |
| Realtime policy on `realtime.messages` | lets authenticated clients subscribe to `shoe-events` |
| RLS | authenticated-read on the app tables; storage locked to service-role |

**Auth users:** `viewer@local.app` (the read-only wall display) and `node-red@local.app` (the
scanner role). The app auto-creates them on first login via the service-role key — no manual SQL.

> ⚠️ `on-showroom-data` is ON-mirrored. If it's ever rebuilt from ON's feed, re-run the ops
> SQL to recreate these objects; the auth users re-create on next login.

---

## 4. File structure

```
src/
  routes/
    index.tsx                     # the wall: composes the hooks + components (~130 lines)
    __root.tsx                    # HTML shell, QueryClient provider, 404/error boundaries
    api/public/ingest/shoe-event.ts  # public ingest route  ┐ both call
    api/ingest/shoe-event.ts         # (same handler)        ┘ handleShoeEventIngest
  components/wall/                # the kiosk UI, one component per file
    TopQuadrant.tsx               #   video / photo + name + tech
    BottomQuadrant.tsx            #   colour drape + black stat panel (uses BarGraph, DataItem)
    KeyLookOverlay.tsx            #   single-shoe lookbook image
    BarGraph.tsx · DataItem.tsx · IdleBackground.tsx · LoginForm.tsx
  components/ui/                  # shadcn primitives (generated — left as-is)
  hooks/
    useScaledUnits.ts             # height-only JS scaling (Vuplex-safe); u()/ut()/px()
    useWallAuth.ts                # auth gate (?k= magic token + login form) + authState
    useRealtimeSlots.ts           # initial slot fetch + Realtime subscription → slots
    use-mobile.tsx                # (shadcn helper)
  lib/
    shoes.functions.ts            # getShoeCatalog / getShoeByEan / getSplitVideoUrl (server fns)
    shoe-event-ingest.server.ts   # the ingest handler (token check, broadcast, persist)
    access.functions.ts           # exchangeAccessToken + signInWithUsername (server fns)
    images.ts                     # selectImageUrl (gallery → highlight → thumbnail)
    secure.ts                     # safeEqual (constant-time compare)
    sales-colors.ts               # hexForSalesColor (the bottom drape colour)
    error-capture.ts · error-page.ts · utils.ts
  integrations/supabase/          # generated — left as-is
    client.ts (browser) · client.server.ts (service-role) · auth-middleware.ts
    auth-attacher.ts · types.ts (generated from the on-showroom-data schema)
  types/wall.ts                   # Side, Slot, Shoe, CatalogRow, BroadcastPayload, AuthState
  constants/animation.ts          # named motion timings
  server.ts · start.ts            # SSR entry + error handling, client auth middleware
  router.tsx · styles.css · assets/ (fonts, on-logo)
supabase/
  migrations/                     # original app-project migrations (historical)
  config.toml
docs/                             # this file, LOCAL-SETUP.md, the ops SQL
```

Generated/vendored files (`components/ui/**`, `routeTree.gen.ts`, the supabase `client*`/
`auth-*`/`types.ts`) are excluded from lint + prettier and are not hand-maintained.

---

## 5. How the key pieces work

- **Catalog prefetch (`getShoeCatalog`, server fn, service-role):** on boot (once authed) the
  wall downloads the whole `compare_wall` view + a map of pre-signed split-video URLs, cached
  by TanStack Query (`staleTime: 1h`). Every scan then resolves from an in-memory
  `Map<ean, Shoe>` — **no per-scan server call**. `selectImageUrl` coalesces the three image
  columns into one `image_url`.
- **Realtime (`useRealtimeSlots`):** subscribes to the `shoe-events` broadcast and applies each
  event to `slots` in memory; also reads `shoe_slots` once on mount for cold-start state.
- **Auth (`useWallAuth`):** an existing session → authed; else a `?k=<VIEWER_ACCESS_TOKEN>`
  magic token is exchanged for a viewer session (token then stripped from the URL); else the
  username/password `LoginForm`. Server fns are guarded by `requireSupabaseAuth`; the browser
  auto-attaches the viewer's bearer to every RPC (`start.ts`).
- **Ingest auth:** the scanner posts `Authorization: Bearer <NODE_RED_PASSWORD>`; checked with
  `safeEqual` (constant-time).
- **Two Supabase clients:** `client.ts` (browser, anon/publishable key — used for auth +
  realtime) and `client.server.ts` (service-role, bypasses RLS — used by server fns).

---

## 6. Setup & running locally

Full step-by-step + the non-obvious gotchas live in [`LOCAL-SETUP.md`](./LOCAL-SETUP.md). In short:

1. **Prereqs:** `bun` (the repo is bun-based).
2. **Env:** copy `.env.example` → `.env` and fill it. **Local dev reads `.env`, not
   `.dev.vars`** (the Cloudflare deploy path uses `.dev.vars`; `bun run dev` does not). `.env`
   is gitignored, so local secrets are safe there. Values come from the Supabase dashboard →
   `on-showroom-data` → Settings → API; you invent `NODE_RED_PASSWORD` / `VIEWER_PASSWORD` /
   `VIEWER_ACCESS_TOKEN`.
3. **Install + run:** `bun install` → `bun run dev` → http://localhost:8080.
4. **Log in:** open `http://localhost:8080/?k=<VIEWER_ACCESS_TOKEN>` (or the form: `viewer` +
   `VIEWER_PASSWORD`).
5. **Test without hardware:** `curl` a scan at the ingest endpoint, or drive it from the
   emulator (in the `on-compare-grid` repo) pointed at the local wall. See LOCAL-SETUP §Testing.

Key scripts (`package.json`): `bun run dev` · `bun run build` · `bun run lint` ·
`bun run format`. Typecheck: `bunx tsc --noEmit`.

> **Gotcha — the `viewer` password is locked after first login.** The app creates the user
> once and never updates its password (a Supabase password change revokes all sessions). To
> change it, delete `viewer@local.app` in Supabase → Auth; it re-creates from `.env`.

---

## 7. Deployment & production runtime

- **Today:** built for **Cloudflare Workers** (`wrangler.jsonc` → `src/server.ts`, via
  `@cloudflare/vite-plugin`, managed through Lovable). Production env vars (incl. secrets) are
  injected by the platform, not committed.
- **Target (in progress):** the wall runs as a **URL asset inside a TSS Play scene**, via
  **Vuplex** (embedded Chromium) on a Windows POS — which is why the JS-only scaling exists.
  Direction: offline-first (cache the asset + a local catalog copy; daily online refresh), and
  live scans delivered over **local MQTT** (bridge → local RabbitMQ → Web-MQTT/WebSocket →
  the app) instead of cloud Realtime. **Same `{event_type, side, ean}` payload** — the event
  handler gains a second input source. RFID stays a direct bridge→app path; TSS Play is the
  display surface only.

---

## 8. Conventions & quality bar

- **TypeScript strict**, no `any` in hand-written code; explicit types on server-fn results +
  component props (shared types in `types/wall.ts`).
- **`bun run lint` is green and `tsc --noEmit` is clean.** Generated/vendored files are
  excluded from lint (`eslint.config.js`) + prettier (`.prettierignore`).
- **Comments explain *why*** (intent, timing, Vuplex/Realtime gotchas), JSDoc on exports.
- **Commits:** small and focused; per-chunk; messages describe intent. (This repo's commits
  intentionally omit a co-author trailer.)
- **Secrets** never in git: `.env` / `.dev.vars` are gitignored; `.env.example` documents the
  keys with no values.

---

## 9. Open items / known gaps

- **Lookbook images:** `compare_wall.lookbook_url` is sparse — a backfill SQL exists on the
  data side (`lookbook_url_backfill.sql`, ~210/943 rows) for Ties to run.
- **Split demo videos:** blocked on ON (made in-house, not delivered). `shoe_split_videos` is
  empty; the static-photo fallback covers shoes until videos land.
- **Image coverage:** ~40% of shoes have a gallery photo; the rest render bare (data, not a bug).
- **`weight_g`:** no source yet (null).
- **Production runtime:** TSS Play asset + local MQTT + offline catalog cache (next phase).
- **Final deploy domain + webhook token** change at go-live (off `on-compare-wall.lovable.app`).
- **QoL (later):** a boot-time download-progress indicator while the catalog + assets cache.

---

## 10. Reference

- **Supabase:** `on-showroom-data`, ref `dlcogzpcduadrshlxqrr` (Frankfurt). Catalog view
  `compare_wall`. Ops objects via [`on-showroom-data-app-backend.sql`](./on-showroom-data-app-backend.sql).
- **Repo:** `github.com/tieswwww/On-Compare-Wall-Webapp` (branch `main`).
- **Ingest contract:** `POST /api/public/ingest/shoe-event`, `Authorization: Bearer
  <NODE_RED_PASSWORD>`, body `{ "event_type": "scanned|swapped|removed", "side": "left|right",
  "ean": "<EAN-13>" }` (`ean` omitted on `removed`).
- **Related:** [`LOCAL-SETUP.md`](./LOCAL-SETUP.md) (run + gotchas), `AI-CHANNEL.md` (cross-team
  coordination, in the `on-compare-grid` repo).
