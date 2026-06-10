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
