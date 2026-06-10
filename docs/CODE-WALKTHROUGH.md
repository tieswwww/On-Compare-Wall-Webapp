# ON Compare Wall — Code Walkthrough

An end-to-end, file-by-file tour of **both** repos in **runtime-flow order** —
from a tag touching a stand to a shoe rendering on the wall. Companion to
docs/ARCHITECTURE.md (the big-picture diagram).

- **Bridge repo** (`on-compare-grid`, branch `tss-gateway`): `rfid_bridge/` — Python.
- **Webapp repo** (`On compare wall`): the kiosk wall — TanStack Start / React.

Sections follow the flow: **bridge read pipeline → bridge output → wall boot →
auth → catalog → live scans → render → media → config/deploy.**

---

## Section 1 — Bridge: turning a tag scan into a clean event

**Goal of this stage:** a UHF reader fires the *same* tag many times a second
with a flickering signal. This stage turns that noisy stream into three clean,
deduplicated events per side: **scanned** (a shoe was placed), **swapped** (one
shoe replaced another), **removed** (the shoe was taken away). Output is a
`FilterEvent { event_type, side, epc }`.

Files: `config.py` → `main.py` (wiring) → `pulsar_client.py` → `side_manager.py`
→ `filter.py`. (EPC→EAN decoding happens in the *next* stage, not here — the
filter works purely in EPCs.)

### `config.py` — the settings shape
Loads `config.toml` into typed dataclasses: `PulsarConfig` (reader host/port,
antenna power, region), `SideConfig` (one per side: `name` + `antenna_port`),
`FilterConfig` (all the debounce/RSSI thresholds), `WebhookConfig`, `MqttConfig`,
and `server_port`. The two sides each claim an antenna port (left = 1, right = 2)
— that's how one reader serves both stands.

### `pulsar_client.py` — talking to the reader
`PulsarLRClient` wraps the metratec SDK and exposes the reader as an async stream
of `(epc, rssi, antenna)` tuples.
- `connect()` opens the reader and starts a **continuous inventory** with
  `with_rssi=True` (we need signal strength to tell "in the spot" from "nearby")
  and `fast_start=True` (~60% faster re-reads when multiplexing two antennas).
- With >1 antenna it **multiplexes** the ports and tags every read with the port
  that saw it — that antenna number is what later maps a read to left/right.
- The SDK delivers tags via a callback (`_on_inventory`) on its own thread; we
  drop each read into an `asyncio.Queue` and `__aiter__` pulls them out, so the
  rest of the bridge can simply `async for` over the reader.
- `connect_with_retry()` loops forever, so a reader that's unplugged at boot
  recovers on its own. `set_status_callback` drives the UI's connected/dropped dot.

### `side_manager.py` — routing reads to the right side
`SideManager` owns **one `SideFilter` per side** and the **one shared reader**.
- It builds an `antenna_to_side` map from config (`(host, port, antenna) → side`).
- `_read_loop()` does the core routing: `async for (epc, rssi, antenna)` from the
  reader → look up which side that antenna belongs to → hand the read to that
  side's filter via `handle_read()`.
- `update_filter_config()` hot-swaps new thresholds into every side's filter —
  that's what the **Apply** button on the status screen calls (tune live, no restart).

### `filter.py` — the debounce "brain" (the clever part)
`SideFilter` is one per side and turns raw reads into clean events. State it keeps:
a table of tags currently in view (`_tags`, keyed by EPC, each with `rssi`,
`seen_count`, `last_seen`) and the EPC it currently considers "placed"
(`_active_epc`).

- **`handle_read(epc, rssi)`** — applies **hysteresis**: a tag must be *strongly*
  in range to enter (`rssi_enter_*` window) but only has to leave a *wider* range
  to drop (`rssi_exit_*`). Two windows stop a shoe at the edge of the zone from
  flickering on/off. In-range → add/refresh the tag (bump `seen_count`); out of
  both windows → forget it. Then re-`_evaluate()`.
- **`_best_candidate()`** — picks the tag most likely to be *the* shoe in the spot:
  in the enter-window AND seen at least `min_seen_count` times, scored by
  `seen_count*0.5 + rssi`. Confidence + closeness, so a faint tag two stands over
  doesn't win.
- **`_evaluate()`** — the decision:
  - best exists, nothing active → **maybe a placement**: start `_enter_debounce`
    (don't commit yet).
  - best exists, differs from active, something *was* active → **swap** fires
    immediately (`swapped`).
  - best is gone, something was active → start `_pickup_debounce`.
- **Debounce timers** confirm the change persisted before firing:
  `_enter_debounce` waits `enter_debounce_ms` and only fires **scanned** if the
  same tag is still best; `_pickup_debounce` fires **removed** only after the spot
  stays empty across *two* checks (`pickup_debounce_ms` + `pickup_commit_ms`) —
  avoids a false removal when a read is just briefly missed.
- **`_fire()`** emits the event and starts a `state_hold_ms` window during which
  no new event can fire — anti-bounce so one placement can't ripple into several.
- **`_tick_loop()`** (started by `start()`) sweeps every 50 ms and **ages out tags
  not seen recently** (>~0.8 s). This is what makes *absence* detectable — with no
  reads, nothing else would ever notice a shoe is gone. The 0.8 s floor matters:
  two antennas multiplexed means each side is only sampled ~2×/s (~0.5 s apart),
  so a shorter window would delete a tag *between* reads and `seen_count` would
  never build up.

**Output:** a `FilterEvent { event_type: scanned|swapped|removed, side, epc }`,
handed to the `on_event` callback that `main.py`/`run_fake.py` provides. Note it
still carries the raw **EPC** — the EAN decode is the next stage.

> Tuning: thresholds were calibrated via `calibrate.py` and live in `config.toml`
> under `[filter]`; the comment there says to re-calibrate on the real stands.

---

## Section 2 — Bridge: getting the event out (decode + transports)

**Goal of this stage:** take the `FilterEvent { event_type, side, epc }` from
Section 1, decode the EPC to an EAN, update the bridge's own state, and deliver
the event on **every configured channel independently** — the local `/wall`
WebSocket (production), the cloud webhook (admin/testing), and optionally the
MQTT gateway. One channel being down never stops the others.

Files: `main.py` (wiring) · `decoder.py` (EPC→EAN) · `api.py` (FastAPI: `/wall`
+ status) · `webhook.py` · `mqtt_publisher.py` · `run_fake.py` (test variant).

### `main.py` — the orchestrator
`run()` is the production entry (`python -m rfid_bridge.main`):
1. `load_config("config.toml")`, build a `BridgeState` (left/right `SideState`),
   `init_state(state)` so the API can read it.
2. Build a `GatewayPublisher` (MQTT, no-op unless configured) and `connect()` it.
3. Define **`on_event(event)`** — the heart of this stage. For each FilterEvent:
   - update that side's `SideState` (event_type, epc, and the decoded `ean` so the
     `/wall` snapshot stays accurate);
   - build the wall payload `{event_type, side, ean}` (ean omitted on `removed`);
   - **deliver every way, independently:** `broadcast_wall()` (local WS) →
     `publisher.publish()` (MQTT) → `send_webhook()` (cloud). Each is wrapped so a
     failure in one doesn't stop the rest;
   - record last webhook status on the side; `broadcast(asdict(state))` to refresh
     the status screen.
4. Wire `SideManager(cfg, on_event)`, `manager.start()`, and serve the FastAPI
   `app` (from `api.py`) with uvicorn on `cfg.server_port` (**8080**).

This is also why the kiosk build points at `ws://localhost:8080/wall` — `main`'s
server and the `/wall` socket are the same uvicorn server on 8080.

### `decoder.py` — EPC → EAN-13
`decode_epc()` turns the 24-hex-char **SGTIN-96** EPC the tag carries into the
**EAN-13** the catalog is keyed by:
- checks the SGTIN-96 header (`0x30`), reads the GS1 **partition** to know how the
  96 bits split into company-prefix vs item-reference, extracts both, strips the
  indicator digit, and computes the GS1 **mod-10 check digit**.
- returns `None` on anything malformed (wrong length, bad header, bad partition) —
  which is why every output path checks for `None` before sending.
- `encode_ean()` is the exact inverse (partition 5), used **only by the fake
  reader** so `decode_epc(encode_ean(x)) == x` — i.e. the fake reader can emit
  real EANs as valid EPCs.

### `api.py` — the FastAPI server (two WebSockets + status screen)
One `app` serves several things on port 8080:
- **`/wall`** (the production transport): a wall connects, we `accept()`, add it to
  `_wall_connections`, and **immediately send a snapshot** —
  `{"type":"snapshot","slots":{left,right}}` from current `SideState.ean` — so a
  freshly (re)loaded wall re-syncs both stands. Then we just hold the socket open;
  the wall never sends. `broadcast_wall(payload)` (called by `on_event`) fans each
  scan event to every connected wall. This is the exact contract the webapp's `ws`
  adapter expects.
- **`/ws`** + **`/`**: the **status/debug screen** — `/` serves `static/index.html`
  (read with `encoding="utf-8"` — the fix for the `â€"` mojibake you saw on
  Windows), `/ws` streams full `BridgeState` to it.
- **`/config`** + **`/config/save`**: live filter tuning — POST new thresholds →
  `app.state.on_config_update` hot-swaps them into the filters (the **Apply**
  button), and `/config/save` writes them back to `config.toml`.
- **`/health`**: returns the current state as JSON.

### `webhook.py` — the cloud path
`send_webhook(event, cfg)` POSTs `{event_type, side, ean}` to `cfg.url` (decoding
the EAN first; bails if decode fails), with one retry. This is the **admin/online**
path — it drives the cloud wall via the ingest route + Realtime. Today
`config.toml`'s webhook URL still points at the dead old project (the harmless
`404`s); the kiosk doesn't use this path at all.

### `mqtt_publisher.py` — the (now-unused) gateway path
`GatewayPublisher` publishes the same JSON to RabbitMQ over AMQP. It's lazy-loaded
and fully optional (no-op if disabled / `aio_pika` missing / gateway down), so it
never breaks the bridge. We **chose the direct `/wall` WebSocket ("Option B")** over
this, so it's effectively dormant — kept for flexibility.

### `run_fake.py` — the hardware-free test runner
Same pipeline and the same `on_event` shape as `main`, but swaps the real reader
for `FakeUhfReader` and runs an **auto-demo loop** (`demo_loop`) that places/swaps/
removes a curated set of real EANs (chosen to exist in `compare_wall`). Key gotcha:
it **defaults to port 8090** (`STATUS_PORT`), so to drive a kiosk build hard-wired
to `:8080` you must run it with `STATUS_PORT=8080` — that was the "worked this
morning, not now" mismatch.

**End of the bridge.** From here a clean `{event_type, side, ean}` is on the
`/wall` WebSocket (and/or webhook). Section 3 picks it up on the webapp side —
starting with how the wall boots.

---

## Section 3 — Wall boot (webapp startup on Cloudflare)

**Goal:** when TSS/a browser loads the kiosk URL, produce the HTML and hand off
to React. Files: `server.ts` (Worker entry) · `error-capture.ts` + `error-page.ts`
· `start.ts` (middleware) · `router.tsx` · `routeTree.gen.ts` · `routes/__root.tsx`.

### `src/server.ts` — the Cloudflare Worker entry
What actually runs on Cloudflare (the deploy configs' `main` points at the built
version of this). `export default { fetch }`: lazy-imports TanStack Start's
`server-entry`, calls its `fetch`, returns the response. The notable part is
error handling: `h3` swallows SSR throws into a generic JSON `500`
(`{"unhandled":true,"message":"HTTPError"}`) that `try/catch` never sees, so
`normalizeCatastrophicSsrResponse()` sniffs for that exact body and returns a
**branded error page** instead (logging the real error recovered out-of-band).

### `src/lib/error-capture.ts` + `error-page.ts`
`error-capture` hooks global `error`/`unhandledrejection` and stashes the last
real Error (5 s TTL) so `server.ts` can recover a stack after h3 flattens it.
`error-page.ts` is a self-contained styled HTML page (no deps, renders even when
the app is broken).

### `src/start.ts` — TanStack Start config (middleware)
`createStart()` registers: **`errorMiddleware`** (server: branded 500 on throws)
and **`attachSupabaseAuth`** (client/function middleware: attaches
`Authorization: Bearer <session token>` before every **server function** call —
this is how authed server fns receive the viewer session; the kiosk calls no
server fns, so it's a no-op there).

### `src/router.tsx` — router + React Query
`getRouter()` builds the TanStack Router from `routeTree.gen.ts` and puts a fresh
**`QueryClient` in router context** — making React Query available to every route
(the catalog query lives on it).

### `src/routeTree.gen.ts`
Auto-generated route tree (don't edit): `__root` + one route `/`.

### `src/routes/__root.tsx`
- **`head()`** — page meta/title (the "ON Compare Wall" branding) + stylesheet.
- **`RootShell`** — SSR document scaffold: `<html><head><HeadContent/>…<body>{children}<Scripts/>`.
  `Scripts` injects the client bundle that hydrates the page.
- **`RootComponent`** — wraps `<Outlet/>` (the matched route) in `QueryClientProvider`.
- **`NotFoundComponent` / `ErrorComponent`** — 404 + error boundary.

### Boot sequence
```
GET kiosk URL → Cloudflare server.ts.fetch → TanStack server-entry → router matches "/"
  → SSR renders RootShell + index route → streams HTML
  → browser paints, loads /assets/*.js (via <Scripts/>) → React hydrates
    → QueryClientProvider + router live → index route mounts (Sections 4+)
```

Next: the index route's first act — the **auth gate** (Section 4).

---

## Section 4 — The auth gate

**Goal:** decide whether to show the wall. State machine `checking → authed |
denied`, three ways in. Files: `useWallAuth.ts` · `access.functions.ts` ·
`secure.ts` · `auth-middleware.ts`.

### `src/hooks/useWallAuth.ts` — the client state machine
- **Kiosk short-circuit:** if `KIOSK_MODE`, `authState` starts **`authed`** and the
  effect returns immediately — no session, no network (offline-friendly; reads the
  anon catalog instead).
- **Browser/admin:** starts `checking`, then: existing session → `authed`; else a
  `?k=` token → `exchangeAccessToken` → `setSession` → **strip token from URL**
  (success or failure) → `authed`; else → `denied` (login form).
- **`handleLogin`** — username/password fallback via `signInWithUsername`.
- `authState` gates everything downstream (catalog query + `useShoeSlots` are
  guarded on `authed`).

### `src/lib/access.functions.ts` — auth server fns
Two service accounts: `viewer@local.app` (display) and `node-red@local.app`
(scanner/ingest).
- **`exchangeAccessToken`** (`?k=`): validates the token vs `VIEWER_ACCESS_TOKEN`
  with **`safeEqual`**, ensures users exist, mints a viewer session.
- **`signInWithUsername`** (form): username `viewer`/`user` + viewer password.
- **`ensureUser`**: creates only if missing — never updates the password on login,
  because Supabase revokes all refresh tokens on a password change (would log out
  every other tab/kiosk).

### `src/lib/secure.ts` — `safeEqual`
Constant-time compare (length-bail then XOR every char, no early exit) so timing
doesn't leak how many token chars matched. Shared with the ingest bearer check.

### `src/integrations/supabase/auth-middleware.ts` — `requireSupabaseAuth`
Server gate on the admin server fns: reads `Authorization: Bearer <token>`,
validates via `getClaims`, injects `{ supabase, userId, claims }`. Pairs with
`start.ts`'s `attachSupabaseAuth` (which sets that header).

### How it connects
```
?k= token → exchangeAccessToken (safeEqual) ─┐
username/pw → signInWithUsername ────────────┤→ setSession (localStorage)
                                              ▼
        attachSupabaseAuth forwards Bearer → requireSupabaseAuth validates → getShoeCatalog runs
```
The **kiosk skips all of this** (authed immediately, anon catalog, no server fns).
Auth only matters for the admin build + cloud ingest.

Next: the catalog — `getShoeCatalog` vs `getCatalogFromView`, and the in-memory map (Section 5).

---

## Section 5 — The catalog (one prefetch, zero per-scan network)

**Goal:** load *every* shoe once, right after auth, into an in-memory
`Map<ean, Shoe>` — so when a scan arrives later, resolving "EAN → full shoe
data" is a synchronous map lookup, no network. This is the core performance/
offline decision of the whole wall. Files: `catalog-columns.ts` ·
`shoes.functions.ts` (admin path) · `catalog-anon.ts` (kiosk path) ·
`images.ts` · `split-videos.ts` · the query + `byEan` map in `routes/index.tsx`.

### `src/lib/catalog-columns.ts` — the single source of truth
Both read paths select from the same place with the same columns:
- **`CATALOG_RELATION = "compare_wall"`** — an **anon-readable view** in the
  `on-showroom-data` Supabase project, keyed by Sample EAN, built to match the
  column list 1:1.
- **`SHOE_COLUMNS`** — the exact columns the wall renders (name, colorway,
  stack/drop/weight numbers, the three 1–5 scales, activity/ride-type text,
  three image-source columns, `lookbook_url`). Kept in sync by hand with
  `CatalogRow`/`Shoe` in `src/types/wall.ts` and with the view definition.

Because both paths share this file, the admin and kiosk catalogs can't drift.

### `src/lib/shoes.functions.ts` — the admin/server path
Two server functions, both gated by `requireSupabaseAuth` (Section 4) and using
`supabaseAdmin` (service-role) on the server:
- **`getShoeCatalog`** (the one actually used at boot): selects all rows from
  `compare_wall`, collapses the three image columns into one `image_url` via
  `selectImageUrl`, **strips the raw image-source columns from the wire
  payload** (client never needs them), then reads `shoe_split_videos` and
  builds the `{ commercial_name → public video URL }` map. Returns
  `{ shoes, splitVideos }`.
- **`getShoeByEan`**: single-shoe lookup by EAN. Same shape, same image
  coalescing — exists for ad-hoc/debug use; the wall itself never calls it per
  scan (that's the whole point of the prefetch).

### `src/lib/catalog-anon.ts` — the kiosk path
The kiosk has **no session** (Section 4 short-circuit), so it can't call the
authed server fn. `getCatalogFromView()` does the same read **client-side with
the anon/publishable key** against the anon-readable `compare_wall` view +
`shoe_split_videos`, and returns the **identical `{ shoes, splitVideos }`
shape** — so the rest of the app doesn't know or care which path ran.
- Split-video read failure is **non-fatal** (logged; the wall just shows static
  photos) — the kiosk should never be killed by a missing nice-to-have table.
- **Import discipline (the subtle bit):** this module imports the *browser*
  Supabase client, which touches `localStorage` at module load — so it must
  never be statically imported by server-reachable code. It's loaded **only via
  dynamic `import()` inside the queryFn** in `index.tsx`, which only runs
  client-side. It's deliberately *not* named `*.client.*` so that deliberate
  dynamic import isn't blocked by the build's import-protection guard.

### `src/lib/images.ts` — `selectImageUrl`
One tiny shared rule: best image = `gallery_image_url` → first of
`highlight_image_urls` → `thumbnail_url` → `null`. Shared so every path
collapses the three source columns the same way.

### `src/lib/split-videos.ts` — stable public video URLs
Split (alpha/transparent) clips live in the **public-read** `shoe-assets`
bucket under `splits/`. `buildSplitVideoMap()` turns `shoe_split_videos` rows
into `{ commercial_name → URL }` using plain public-object URLs — **no signing,
no expiry**, which matters twice: the anon kiosk needs no service role to build
them, and the URLs are stable so the browser/preloader can cache them.
Note the map is keyed by **commercial_name**, not EAN — one video covers every
colorway of a model.

### `src/routes/index.tsx` — the query + the map
```ts
useQuery({
  queryKey: ["shoe-catalog", KIOSK_MODE ? "kiosk" : "server"],
  queryFn: () => KIOSK_MODE ? import("@/lib/catalog-anon")... : getShoeCatalog(),
  enabled: authState === "authed",       // gated on Section 4
  staleTime: 1h, gcTime: Infinity,       // fetch once, keep forever
})
```
Then two memos make it usable:
- **`byEan`** — `Map<ean, Shoe>` over `catalog.data.shoes`. Every scan resolves
  via `byEan.get(ean)`.
- **`splitByName`** — the `{ commercial_name → video URL }` record.

```
authed ──► getShoeCatalog (admin)  ─┐
       └─► getCatalogFromView (kiosk) ┴─► { shoes, splitVideos }
                                            │            │
                                            ▼            ▼
                                     Map<ean, Shoe>   splitByName
                                            │
                          scan event (ean) ─┴─► byEan.get(ean) → render (no network)
```

Next: where those scan events come from — the pluggable transports and the
cloud ingest route (Section 6).

---

## Section 6 — Live scans (transports + the cloud ingest route)

**Goal:** get each `{event_type, side, ean}` from the bridge (Section 2) into
React state — `slots.left.ean` / `slots.right.ean` — through whichever channel
this deployment uses. The design move here is a **pluggable transport
interface**: three adapters, one shared slot-update function, picked by an env
var. Files: `transport/types.ts` · `transport/ws.ts` · `transport/mqtt.ts` ·
`transport/realtime.ts` · `useShoeSlots.ts` · `shoe-event-ingest.server.ts` +
the two `routes/api/.../shoe-event.ts` routes.

### `src/lib/transport/types.ts` — the contract everything shares
- **`SlotTransport`** — an adapter is just
  `{ start(callbacks) → teardown }`. Callbacks: `onEvent(event)` per scan, and
  optional `onSnapshot(rows)` for full state on connect.
- **`coerceShoeEvent` / `parseShoeEvent`** — defensive validation of the raw
  payload into a `ShoeEvent`; anything malformed becomes `null` and is ignored
  (a bad message can never crash the wall). Fills `previous_ean`/`ts` defaults
  since the bridge omits them.
- **`applyShoeEvent(prev, event)`** — the *one* slot-update rule, pure and
  shared by all transports: `removed` clears the side's EAN, `scanned`/
  `swapped` set it. That's the entire state machine on the wall side — all the
  hard debouncing already happened in the bridge filter (Section 1).

### `src/lib/transport/ws.ts` — the installation path ("Option B", in use)
Connects straight to the bridge's `/wall` WebSocket on the POS
(`ws://localhost:8080/wall` — same uvicorn server from Section 2). Mirrors the
bridge's contract exactly:
- first message is the **snapshot** `{type:"snapshot", slots:{left,right}}` →
  `onSnapshot` (so a reloaded wall instantly re-syncs both stands);
- every later message is an event → `coerceShoeEvent` → `onEvent`;
- **auto-reconnects every 2 s** (`onerror` → `close()` → `onclose` → retry), so
  it recovers if the bridge restarts or the wall loaded first. Fully offline:
  localhost only, no broker, no cloud.

### `src/lib/transport/mqtt.ts` — the broker alternative (dormant)
Web-MQTT over WebSocket to a local RabbitMQ (`ws://localhost:15675/ws`, topic
`shoe-events`). Same payload, same `parseShoeEvent`. Offline-capable like ws,
but needs RabbitMQ running on the POS — that's why the direct ws transport won.
**No snapshot** on this path: kiosk slot state starts empty and builds from
events. `mqtt` is imported dynamically so the (large) library never loads
unless this transport is selected.

### `src/lib/transport/realtime.ts` — the cloud/dev/admin path
On start: one read of the `shoe_slots` table for the initial snapshot, then
subscribes to the Supabase Realtime **`shoe-events` broadcast channel** and
forwards each payload. This is the receiving end of the ingest route below.
(`shoe_slots` isn't anon-readable, so an anon client just gets an empty
snapshot — harmless, and the kiosk doesn't use this transport anyway.)

### `src/hooks/useShoeSlots.ts` — the hook that ties it together
Gated on `authState === "authed"` (Section 4) and client-only. Picks the
adapter from `EVENT_TRANSPORT` (`realtime` default · `mqtt` · `ws`), starts it
with two setState-wiring callbacks (`onEvent` → `applyShoeEvent`, `onSnapshot`
→ overwrite both sides), and returns the live `{left, right}` slots. The
teardown returned by `start()` is the effect cleanup.

### The cloud ingest route — how scans reach Realtime in the first place
`src/routes/api/ingest/shoe-event.ts` (+ the `/api/public/...` twin, same
handler — the public path exists for callers that can't reach the authed-path
URL shape) both POST into **`src/lib/shoe-event-ingest.server.ts`**:
1. **Auth:** `Authorization: Bearer <NODE_RED_PASSWORD>` checked with
   `safeEqual` (the same constant-time compare from Section 4) → 401 otherwise.
2. **Validate:** zod-parse `{event_type, side, ean?}`; `scanned`/`swapped`
   require an EAN.
3. **previous_ean:** read the side's current `shoe_slots` row first, so the
   broadcast can say what was replaced.
4. **Broadcast first, persist second:** send the full payload on the
   `shoe-events` channel (this is what `realtime.ts` receives — sub-second
   latency), then update `shoe_slots` (the snapshot source for late joiners)
   and append to `shoe_events` (the audit log, with the raw body).

This is the path the bridge's **webhook** (Section 2) targets — so the full
cloud chain is: bridge webhook → ingest route → Realtime broadcast → admin
wall. The kiosk chain is just: bridge `/wall` ws → ws transport. Both end at
the same `applyShoeEvent`.

```
KIOSK:  bridge /wall ws ──────────────────────────► ws.ts ──┐
CLOUD:  bridge webhook → /api/ingest/shoe-event             ├─► applyShoeEvent → slots {left,right}
          (Bearer + zod) → Realtime broadcast → realtime.ts ┘        │
                          └→ shoe_slots (snapshot) + shoe_events (log)
                                                                     ▼
                                                       byEan.get(slots.X.ean) → render
```

Next: what the wall actually does with a resolved shoe — the render layer
(Section 7).

---

## Section 7 — Render: the 2×2 wall and its motion language

**Goal:** turn `{left: Shoe|null, right: Shoe|null}` into the wall — a 2×2
grid (top = visual, bottom = stats, one column per stand), with everything
animating *in and out* smoothly. Files: `routes/index.tsx` (composition) ·
`TopQuadrant.tsx` · `BottomQuadrant.tsx` (+ `BarGraph`/`DataItem`) ·
`KeyLookOverlay.tsx` · `IdleBackground.tsx` · `useScaledUnits.ts` ·
`constants/animation.ts` · `sales-colors.ts`.

### `src/routes/index.tsx` — composition + the key-look decision
After the auth/catalog plumbing (Sections 4–5), the render itself:
- `shoes.left/right` = `byEan.get(slots.X.ean)` — the zero-network resolve.
- `videoUrls.left/right` = `splitByName[shoe.commercial_name]`.
- Layered z-order: `IdleBackground` (On logo, shows through when idle) →
  `PreloadProgress` (idle only) → `KeyLookOverlay` (behind the quadrants) →
  the four quadrants.
- **Key-look rule:** when exactly ONE shoe is scanned, its `lookbook_url`
  image fills the *opposite, empty* half. A ref tracks whether both sides were
  occupied last render: if the single-shoe state came from a **removal**, the
  reveal waits `KEYLOOK_DELAY_AFTER_REMOVAL_MS` (1400 ms, lets the
  compare→single transition settle); on a **fresh first scan** it's near-
  immediate (300 ms).

### The "hold the last shoe" pattern (used everywhere)
React's natural behaviour — `shoe` becomes `null`, content vanishes — would
make removals *pop* off screen. So every visual component keeps a
`displayedShoe`/`displayedUrl` copy in state: when the live prop goes null,
the copy sticks around for a timeout (`SHOE_HOLD_MS` = 1200 ms etc.) while the
*visibility* (opacity/clip-path, driven by the live prop) animates out; only
then is the content cleared. Live prop drives the animation, displayed copy
drives the content.

### `TopQuadrant.tsx` — video (or photo) + name
- Renders the looping split video if the shoe has one; otherwise the static
  `image_url` photo as fallback (most shoes have a photo but no video yet).
- Video reveal is double-gated: `onLoadedData` fired AND
  `VIDEO_REVEAL_DELAY_MS` (250 ms) elapsed — so it never fades in to a black
  half-buffered frame. The photo equally fades in only once *its* URL has
  loaded (tracked per-URL so a new shoe starts hidden).
- Name + technology tags sit at a fixed offset from the quadrant bottom
  (position identical with or without video) and fade/blur in and out.

### `BottomQuadrant.tsx` — the two-stage stats reveal
Two full-bleed layers animated with `clip-path: inset(...)`:
1. the **sales-colour drape** drops from the top, then (150 ms stagger)
2. the **black panel** drops over it carrying the stats.
On close the order reverses (black retracts first). The colour and stats both
use the hold pattern so a removed shoe closes with *its own* colour/data.
Content: experience header, three `BarGraph`s (cushioning/responsiveness/
stability as 1–5 segment bars), and `DataItem` blocks (Activity, Best For,
Ride Type, Recommended Distance — `DataItem` splits values into lines on
commas/`<br>`/newlines and renders nothing when empty).

### `src/lib/sales-colors.ts` — name → drape colour
On's `sales_color_name` looks like `"Black | Frost"`. `hexForSalesColor`
resolves every token against a hand-picked ~200-entry hex map, then picks the
**most saturated** hit (so "Black | Flame" drapes orange, not black), then runs
a **brighten pass** in HSL: lift lightness to a floor of 0.59, clamp very-light
colours below a ceiling, boost saturation so it pops, keep true neutrals
neutral, preserve hue exactly. Fallback `#cccccc`. Presentational hint, not
brand spec — tweak freely.

### `KeyLookOverlay.tsx` — the lookbook half
Full-height `object-cover` image on the empty half. Reveal is gated on image
**decode** (`img.decode()`, not just `onload` — pixels ready to paint) AND the
delay from `index.tsx`; then opacity + slight scale + a brightness(0→1) ramp
fade it in. The delay is read through a ref so a delay change mid-transition
can't re-arm a shorter timer (a real bug this guards against).

### `src/hooks/useScaledUnits.ts` — height-only scaling (the Vuplex story)
The wall is designed at **1920 px portrait height**; everything scales linearly
with `window.innerHeight / 1920`, width ignored. Two hard-won constraints:
- **All math in JS, plain `Npx` strings out.** The embedded Chromium in Vuplex
  (TSS Play's webview) evaluates CSS `calc()`/`min()` inconsistently — fonts
  collapsed to browser default before this rewrite.
- **Hydration trick:** the server renders at scale 1. If the first client
  render used the real scale, React would *record* the right values without
  writing them (hydration trusts server markup) — huge UI until a resize. So
  the first client render also uses scale 1, then a layout effect flips to the
  real scale *before paint*: a genuine value change, so React writes the
  styles. No flash, no mismatch.
Helpers: `u(n)` spacing px, `ut(n)` text px (0.7× — designed sizes read ~2× too
big on screen), `px(n)` a fontSize style. One module-level scale shared by all
components; resize re-renders subscribers.

### `src/constants/animation.ts`
All motion timings in one file — the reveal delays, hold durations, stagger,
and transition lengths referenced above — so the wall's motion language is
tuned in one place. Each constant's comment says what it gates.

Next: keeping all that media instant — the boot-time preloader (Section 8).

---

## Section 8 — Media: the boot-time asset preloader

**Goal:** a scan should *never* show download jank — when a shoe lands on the
stand, its photo, split video, and lookbook should already be in the browser
cache. So at boot, while the wall sits idle, it quietly downloads the entire
catalog's media. Files: `useAssetPreloader.ts` · `PreloadProgress.tsx` (+ the
stable URLs from `split-videos.ts`, Section 5, that make caching possible).

### `src/hooks/useAssetPreloader.ts`
Called from `index.tsx` with the catalog data; runs **once per session**
(guarded by a ref) as soon as the catalog arrives.
- **Asset list:** the deduped set of every shoe's `image_url` plus every split
  video URL.
- **Throttled pump:** a tiny hand-rolled scheduler keeps at most
  `MAX_CONCURRENT = 6` requests in flight — fast, but doesn't hammer On's CDN
  or starve the WebSocket at boot. Each settle (success *or* failure) starts
  the next asset, so progress always reaches 100%.
- **Per-kind loading:** images via `new Image()` (browser caches the decode
  path it'll reuse in `<img>`); videos via `fetch().blob()` — `fetch` alone
  resolves on *headers*, `.blob()` forces the **full file** down so the whole
  video is cached, not just its first bytes.
- Returns `{ total, loaded, progress, done }` for the indicator.
- **Scope (important):** this warms the in-session **HTTP cache** only. It
  makes scans instant and survives brief network drops, but it is *not*
  restart-proof offline storage — that would be a service worker, which was
  tried and reverted (`4eb24c3`); the install is assumed online at boot.

### `src/components/wall/PreloadProgress.tsx`
The on-brand boot indicator on the idle screen: "Caching media · N%" over a
thin progress bar, bottom-centre. Fades out when done, renders nothing when
there's nothing to cache, and `index.tsx` hides it the moment any shoe is
scanned (it's idle-screen-only chrome).

Why this matters doubly for the kiosk: the split-video URLs are unsigned,
stable public URLs (Section 5), so the cache entries stay valid — a signed URL
with an expiry would bust the cache every refresh.

Next: the two builds, env vars, and how it all ships (Section 9).
