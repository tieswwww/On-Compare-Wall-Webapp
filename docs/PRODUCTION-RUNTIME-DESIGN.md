# Production Runtime Design — TSS Play + local MQTT + offline

> **Status: DRAFT for review** (opus_tsc, 2026-06-09). Roadmap step 6. This is the
> webapp-side plan + the decisions still needed from Ties (architecture) and opus_ties
> (bridge/broker) before we build. Nothing here is built yet.

## Goal

The wall ships as a **web asset inside TSS Play** (Vuplex/embedded Chromium) on a Windows
POS, **offline-first**: internet is needed only ~once/day to refresh the catalog (and pick up
app updates); **live scans arrive over local MQTT**; between refreshes the wall keeps working
with **no internet**.

## Current architecture — what won't survive offline

The app today is cloud-dependent at runtime:

| Concern | Today                                                 | Problem offline               |
| ------- | ----------------------------------------------------- | ----------------------------- |
| Catalog | `getShoeCatalog` server fn (service-role) → Supabase  | needs the cloud server + DB   |
| Events  | Supabase **Realtime** broadcast (cloud)               | needs the cloud               |
| Auth    | viewer Supabase session gates the server fns          | token refresh needs the cloud |
| Ingest  | cloud server route persists slots/events + broadcasts | not in the local path         |

So as-is the wall needs internet at runtime. Offline-first means **decoupling the runtime
read/event paths from the cloud**.

## Target architecture

```
INSTALLATION (offline between daily refreshes)
  RFID bridge → local RabbitMQ (Web-MQTT plugin) → ws://localhost → MQTT.js in the wall
                                                                    (running in Vuplex on the POS)
  Daily, online:  wall fetches compare_wall (anon key) → durable local cache (catalog + images)
  Runtime, offline:  events via MQTT → in-memory slots → render from the local cache
```

**Helpful fact (verified):** `compare_wall` is **anon-readable** (public RLS read policy), so
the kiosk can fetch + cache the catalog with the **publishable/anon key — no viewer session
required**. (`shoe_slots` is _not_ anon-readable, but the kiosk gets slot state from MQTT, not
from reading that table.)

## Webapp-side work items

1. **Event transport abstraction + MQTT input** _(the core change)_
   - Refactor `useRealtimeSlots` → a transport-agnostic `useShoeSlots` that takes an adapter.
   - Add an **MQTT.js adapter** (WebSocket) that connects to the local broker, subscribes to
     the scan topic, parses the **same `{event_type, side, ean}` payload**, and feeds the same
     slot-update logic. Realtime stays as a second adapter.
   - **Config-flagged transport:** `realtime` (dev/cloud) · `mqtt` (installation) · or both.
     One build, behaviour switched by env/config — no divergent builds.

2. **Durable catalog cache (read offline)**
   - On a daily online boot: fetch the catalog (directly from anon-readable `compare_wall`, or
     keep the server fn for online and cache its result) and store it in a **durable client
     cache** (Cache API or IndexedDB).
   - Offline / on fetch failure: **read from the cache**. The wall always has a catalog.

3. **Service worker — offline app shell + image cache** _(Phase 2 of the preloader)_
   - Cache the app shell so Vuplex can **reload offline** after the daily restart (rather than
     relying on TSS to snapshot the asset).
   - Cache the catalog images **durably**, overriding ON's short `max-age` (gallery images are
     only `max-age=900` ≈ 15 min). Builds directly on `useAssetPreloader`.
   - ⚠️ Requires a **secure context** (https/localhost) + Vuplex/Chromium SW support — confirm.

4. **Kiosk mode (no interactive auth)**
   - Since `compare_wall` is anon-readable and the POS is a trusted local environment, the
     kiosk shouldn't need the viewer login. Add a **kiosk mode** (config-flagged) that reads
     the catalog with the anon key and skips the login gate. The viewer login stays for the
     browser-preview/admin case.

5. **Ingest / persistence offline**
   - In the installation, events go MQTT → browser → in-memory slots; the cloud ingest route
     (slots/events persistence + Realtime) isn't in that path. Proposal: the offline kiosk
     **doesn't persist** slots/events to the cloud (display doesn't need it); if audit is
     wanted, the bridge logs locally.

## Decisions needed before building

**Ties's architecture calls (resolved 2026-06-09):**

- **A. Asset serving + offline reload — LEANING: TSS handles app-shell offline serving**
  (Ties, not 100% certain → **verify with the TSS team**). Plan: rely on TSS to reload the
  asset offline; we still add **durable image caching** regardless (TSS won't have on-demand
  images cached, and ON's gallery `max-age` ≈ 15 min). Add an app-shell service worker only if
  TSS turns out not to snapshot the asset.
- **B. Kiosk auth — DECIDED: kiosk mode, no login.** The POS reads anon-readable `compare_wall`
  with the publishable key; the viewer login stays only for browser/admin use.
- **C. Offline persistence — DECIDED: in-memory only.** No cloud `shoe_slots`/`shoe_events`
  persistence in the installation; the bridge can log locally if an audit is ever wanted.
- **D. Refresh cadence — assumed:** the catalog refresh happens on the **daily (online)
  restart**, app updates piggyback. Flag if different.

**For opus_ties (bridge / broker):**

- **E. MQTT specifics.** Confirm **RabbitMQ Web-MQTT** plugin; the exact **`ws://host:port`**
  the browser connects to; the **topic name(s)**; any **username/password** for the WS
  connection; and that the payload is the same `{event_type, side, ean}` JSON. Does the bridge
  publish to MQTT **in addition to / instead of** the webhook?

## Proposed build sequence (once decisions are locked)

1. Transport abstraction + MQTT.js adapter (config-flagged; dev keeps Realtime).
   _Blocked on E (opus_ties's broker specifics)._
2. Durable catalog cache (fetch → cache → read-offline) via the anon key.
3. Service worker (app shell + durable image cache) for offline reload.
   _Gated on A (TSS-team answer)._
4. ~~Kiosk mode (skip login, anon catalog) behind a flag.~~ **DONE** (commit `4f45def`,
   `VITE_KIOSK_MODE`). The flag short-circuits the auth gate and reads the anon-readable
   `compare_wall` view directly (`src/lib/catalog.client.ts`); verified the anon read returns
   all SHOE_COLUMNS. Off by default → browser/admin flow unchanged. Events still use Realtime
   until the MQTT adapter (1) lands.
5. End-to-end test on the Windows laptop: bridge → local broker → wall, pull the network.

### Note on E — partial broker info already in `.env.example`

`.env.example` already carries TSS-gateway settings: host
`tsc-nl-ties-control.storytellingsuite.com`, **`TSS_GATEWAY_PORT=5672` (AMQP)**, user `location`,
topic `shoe-events`. That's the **AMQP** port — the browser MQTT.js adapter needs a **Web-MQTT
WebSocket** endpoint (RabbitMQ's Web-MQTT plugin, typically `ws://host:15675/ws`). So E still
needs confirmation: is Web-MQTT enabled, what's the **ws** host:port/path, and is it reachable
**locally on the POS** (the design assumes a *local* broker for offline; this host looks remote).

## Principle

Everything behind a **config flag** so the dev setup (cloud Realtime + auth) and the
installation (MQTT + offline + kiosk) coexist in **one codebase, one build**.
