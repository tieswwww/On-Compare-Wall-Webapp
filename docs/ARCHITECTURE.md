# ON Compare Wall — Architecture

How everything connects: the bridge, the two webapp builds, Supabase, and the
local-vs-online split. Companion to docs/WEBAPP-HANDOVER.md (file-level detail)
and docs/PRODUCTION-RUNTIME-DESIGN.md (the offline runtime plan).

## The big idea: one app, two builds, two event paths

There are **two deployments of the same webapp**, and the bridge can deliver
events **two ways**. That's the source of most "local vs online" confusion.

| | **KIOSK** (the installation) | **ADMIN** (testing / remote view) |
| --- | --- | --- |
| URL | `on-compare-wall-kiosk.ties-webers.workers.dev` | `on-compare-wall.ties-webers.workers.dev` |
| Login | none (anon) | `?k=` token / viewer login |
| Events from | **local bridge WebSocket** | **Supabase Realtime** (cloud) |
| Bridge feeds it via | `/wall` WebSocket | **webhook** (HTTP POST) |
| Internet at runtime? | **No** (only ~daily for catalog) | Yes |
| Build flags | `VITE_KIOSK_MODE=true VITE_EVENT_TRANSPORT=ws` | defaults |

Both come from one codebase; the kiosk flags are set at **build time** (see the
`deploy` vs `deploy:kiosk` scripts).

## Nodes (boxes for a diagram)

**On the POS (local — one self-contained unit per installation):**
- **PulsarLR RFID reader** — UHF reader, two antennas (left stand, right stand).
- **RFID Bridge** (Python, `rfid_bridge/`, serves `localhost:8080`) — decodes
  EPC→EAN, debounces, routes left/right, and serves the `/wall` WebSocket + a
  status screen. Can also POST a webhook and (optionally) publish MQTT.
- **TSS Play** (Vuplex / embedded Chromium) — loads the kiosk URL and displays
  the wall full-screen.

**Cloud:**
- **Cloudflare Workers** — hosts the webapp (two deploys: admin + kiosk).
- **Supabase** (`on-showroom-data`, ref `dlcogzpcduadrshlxqrr`):
  - `compare_wall` — the catalog view (anon-readable), keyed by Sample EAN.
  - `shoe_split_videos` — `commercial_name → video_filename` map (anon-readable).
  - `shoe-assets` bucket — **public-read**, holds the split videos under `splits/`.
  - `shoe_slots` / `shoe_events` — operational tables (the cloud webhook path).
  - **Realtime** — broadcast channel used by the admin path.

## Flow 1 — INSTALLATION (production; offline at runtime)

```
        ┌──────────────── ON THE POS (local, no internet at runtime) ────────────────┐
  RFID tag                                                                            │
   (shoe)                                                                             │
     │ radio (EPC)                                                                    │
     ▼                                                                                │
 ┌───────────┐  TCP/USB  ┌────────────────────────────┐                              │
 │ PulsarLR  │ ────────► │  RFID Bridge (Python)        │                             │
 │ (L+R ant) │           │  localhost:8080              │                             │
 └───────────┘           │  • EPC → EAN decode          │                             │
                         │  • debounce / left-right     │                             │
                         │  • serves /wall + status     │                             │
                         └──────────────┬───────────────┘                            │
                                        │ ws://localhost:8080/wall                    │
                                        │ {event_type, side, ean}   ← LOCAL, no net   │
                                        ▼                                             │
                         ┌────────────────────────────┐                              │
                         │ TSS Play (Vuplex/Chromium) │ ── displays ──► SCREEN        │
                         │ loads the KIOSK URL        │                              │
                         └──────────────┬─────────────┘                              │
        └───────────────────────────── │ ───────────────────────────────────────────┘
                                        │ (page loaded once, cached; catalog ~daily)
            ░░ INTERNET (only ~once a day) ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
                                        ▼
   ┌──────────────────────────┐   ┌────────────────────────────────────────────┐
   │ Cloudflare: KIOSK bundle  │   │ Supabase (on-showroom-data)                 │
   └──────────────────────────┘   │ • compare_wall (catalog, anon)              │
                                   │ • shoe_split_videos (anon map)              │
                                   │ • shoe-assets bucket (PUBLIC split videos)  │
                                   └────────────────────────────────────────────┘
```

The **page** is online (pulled from Cloudflare, then cached); the **live scans**
are **local** (bridge → WebSocket). Internet is needed only ~once a day to
refresh the catalog and pull app updates. On a daily online boot the kiosk
fetches `compare_wall` + `shoe_split_videos` with the anon key and **pre-caches
all images + split videos**, then runs offline.

## Flow 2 — ADMIN / ONLINE (testing & remote monitoring; needs internet)

```
 ┌──────────────┐  webhook: HTTPS POST              ┌──────────────────────────┐
 │ RFID Bridge  │  /api/public/ingest/shoe-event    │ Cloudflare: ADMIN URL     │
 │ (or emulator)│ ────────────────────────────────► │ ingest route (Bearer)     │
 └──────────────┘  {event_type, side, ean}          │ writes slots/events       │
                                                     └────────────┬─────────────┘
                                                                  │ broadcast
                                                                  ▼
                                                     ┌──────────────────────────┐
                                                     │ Supabase Realtime         │
                                                     └────────────┬─────────────┘
                                                                  │ live push
                                                                  ▼
                                                     ┌──────────────────────────┐
                                                     │ Admin wall (browser)      │
                                                     │ login via ?k= token       │
                                                     └──────────────────────────┘
```

## The bridge has two outputs (configurable per deployment)

```
                  ┌─► /wall WebSocket (localhost)  → KIOSK install   [production]
 RFID Bridge ─────┤
                  └─► webhook HTTP POST (cloud)    → ADMIN wall via Realtime  [online/test]
```

An MQTT publisher also exists in the bridge, but we chose the direct WebSocket
("Option B") and dropped MQTT for the installation — it needs no broker and is
self-contained per POS.

## How a scan becomes a shoe + video (data resolution)

```
 EAN (from tag)
   │  look up in compare_wall (prefetched into an in-memory Map)
   ▼
 Shoe { commercial_name, specs, image_url }
   │  shoe.commercial_name → look up in the shoe_split_videos map
   ▼
 has a video?  ── yes ─► play split video  (public URL from shoe-assets)
               └─ no  ─► show static product photo
```

The link is the **model name** (`commercial_name`), shared between `compare_wall`
and `shoe_split_videos` — there's no EAN in the video table, so every colorway of
a model shares one clip. Exact string match, so names must align (e.g. `LS` →
`LightSpray`).

## Auth & access summary

- **compare_wall** and **shoe_split_videos**: anon-readable (public catalog data).
- **shoe-assets** bucket: public-read (split videos).
- **Kiosk**: no login — reads the above with the publishable (anon) key.
- **Admin**: viewer login (or `?k=` magic token); catalog via a service-role
  server fn; events via Realtime.
- **Ingest endpoint** (`/api/public/ingest/shoe-event`): bearer-token auth
  (`NODE_RED_PASSWORD`) — used by the webhook path only.

## Known footnote — the webhook 404

The bridge's `config.toml` webhook still points at the **old, dead** Supabase
project, so it logs harmless `404`s. The **kiosk ignores the webhook entirely**
(it uses the local WebSocket). The webhook only matters if the *admin* wall should
mirror scans online — then it gets repointed at the admin ingest URL (+ matching
the `Authorization: Bearer` header).

## Offline boot (service worker)

TSS Play does **not** reload the asset offline (a no-internet restart shows
"unable to load content"), so the kiosk caches **itself** via a service worker
(`public/sw.js`, registered kiosk-only by `src/lib/register-sw.ts`). After one
full **online** session it serves the app shell + catalog reads + media from the
Cache API offline, so the wall boots and renders with no internet; live scans
still come from the local bridge WebSocket. ⚠️ Requires Vuplex/Chromium to
support service workers — confirm on the POS.

## Still on the roadmap

- **Data gaps** (data-side): some shoes have sparse `compare_wall` rows; lookbook
  and `weight_g` backfills.
- **Vuplex confirmation**: (a) the service worker actually caches offline inside
  Vuplex; (b) `ws://localhost` connects from the HTTPS kiosk page in Vuplex (works
  in a normal browser; if blocked, the bridge serves `wss://`).
