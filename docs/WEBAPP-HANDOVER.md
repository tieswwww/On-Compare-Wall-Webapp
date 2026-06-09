# ON Compare Wall — Web App Handover

> **What this is:** a single, self-contained brain-dump of the **web app** half of
> the ON Compare Wall — the on-screen kiosk that visitors actually look at. Written
> so someone (or another AI assistant) with **no prior context** can understand what
> the app is, how it's built, how data flows through it, and what's still open.
>
> **Date:** June 2026 (2026-06-08) · **Audience:** non-specialist + AI assistants.
> Plain language, explains the _why_, not just the _what_.
>
> **Companion docs (the other half):** the hardware/data side lives in a separate
> repo with its own write-ups — `docs/PROJECT-HANDOVER.md` (whole system) and
> `docs/PulsarLR-Integration-Handoff.md` (the RFID bridge). Coordination between the
> two sides happens in `AI-CHANNEL.md`. This doc is the web-app counterpart to those.

---

## 0. TL;DR (read this first)

- **The app** is a fullscreen **portrait kiosk page** (designed 1080×1920) for in-store.
  It's purely reactive: no touch, no operator. A scanner tells it which shoe is on the
  **left** and **right** stand; it shows each shoe and a side-by-side compare layout.
- **The chain it sits in:** `RFID tag → reader → Python bridge → THIS APP → screen`.
  The bridge POSTs one webhook per event; the app flips the screen in <300ms.
- **Stack:** TanStack Start (React 19, Vite 7), Tailwind v4 + shadcn/ui, Supabase
  (Postgres + Auth + Realtime + Storage), TanStack Query/Router, deployed on
  **Cloudflare Workers** (built/managed via Lovable). Package manager: **bun**.
- **Data:** the app reads from its **own** Supabase project — a **flat `shoes` table**
  keyed by EAN — which it **prefetches once** at boot and resolves entirely in memory.
  It does **not** read TSC's `on-showroom-data` / `compare_wall` view.
- **What's settled:** the ingest webhook, Realtime broadcast, slot/event persistence,
  the auth model, and the whole kiosk UI all work and match the bridge's contract.
- **What's open:** how the `shoes` catalog gets **populated** long-term (a new ON-fed
  DB + a daily offline-first local copy is the leaning direction, not final), where
  **lookbook images + split videos** are sourced, and the final **deploy domain +
  webhook token**.

---

## 1. What the visitor sees (the experience)

A 2×2 grid filling a portrait screen. The screen is split **left / right** (one shoe
per side) and **top / bottom**:

- **Top quadrant (per side):** a looping **demo video** of the shoe, with the shoe's
  **name** and a row of **technology** tags anchored beneath it.
- **Bottom quadrant (per side):** a two-stage reveal — first a **colour drape** in the
  shoe's sales colour drops down, then a **black stat panel** drops over it showing the
  **Energy/experience** header, three **bar graphs** (Cushioning / Responsiveness /
  Stability, 1–5), and data rows (**Activity, Best For, Ride Type/Feel, Recommended
  Distance**).
- **One shoe only:** the _opposite_ empty half shows that shoe's full-height **"Key
  Look" lookbook image** (`KeyLookOverlay`), which fades + brightens in.
- **Idle (nothing scanned):** an On logo sits top-right (`IdleBackground`).

**Motion language** (all in `src/routes/index.tsx`): staggered panel drops (colour
then black on open; reverse on close), opacity/blur fade-ins on the name, a brightness
ramp on the key look. Crucial trick: when a shoe is removed, the app **keeps rendering
the last shoe for ~1.2s** while the close animation plays, then clears — so panels
animate out gracefully instead of snapping to empty.

**Scaling — the one non-obvious UI rule.** All sizing is computed in **JavaScript**
against a fixed **1920px design height** and emitted as plain `Npx` strings. We
deliberately avoid CSS `calc()` / `min()` / length math because the **embedded Chromium
in Vuplex** (the kiosk runtime) evaluates them inconsistently — previously every
font-size collapsed to default. Helpers: `u(n)` = spacing px, `ut(n)` = text-tracking
px (0.7×), `px(n)` = a `fontSize` style. Scaling is **height-only**; width has no effect.

---

## 2. End-to-end flow (a shoe gets placed)

```
1. Bridge POSTs:  POST /api/public/ingest/shoe-event
                  Authorization: Bearer <NODE_RED_PASSWORD>
                  { "event_type": "scanned", "side": "left", "ean": "7615537532448" }
2. handleShoeEventIngest (src/lib/shoe-event-ingest.server.ts):
   a. verifies the bearer token
   b. reads the slot's current ean (→ previous_ean)
   c. BROADCASTS on the "shoe-events" Realtime channel  ← screen flips here, <300ms
   d. UPDATES shoe_slots for that side
   e. INSERTS a row into shoe_events (audit)
3. The wall page (src/routes/index.tsx) is subscribed to "shoe-events":
   it updates its in-memory `slots`, looks up the EAN in the prefetched
   catalog Map, and renders the shoe. Removal clears the side.
```

The broadcast happens **before** the DB write on purpose: the screen reacting fast is
what matters; the `shoe_slots`/`shoe_events` writes are persistence/audit. On a cold
load the page also does one `shoe_slots` select to catch the current state.

---

## 3. The stack & where everything lives

| Area                   | File(s)                                                                                                            | Role                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Wall UI**            | `src/routes/index.tsx`                                                                                             | The entire kiosk page: auth gate, realtime subscription, catalog lookup, all four quadrants + overlays. ~730 lines, the heart of the app.                          |
| **Ingest endpoint**    | `src/routes/api/public/ingest/shoe-event.ts` (+ `src/routes/api/ingest/shoe-event.ts`)                             | Thin route wrappers → `handleShoeEventIngest`. Two paths share one handler.                                                                                        |
| **Ingest logic**       | `src/lib/shoe-event-ingest.server.ts`                                                                              | Token check, Realtime broadcast, slot update, event insert.                                                                                                        |
| **Catalog reads**      | `src/lib/shoes.functions.ts`                                                                                       | `getShoeCatalog` (full prefetch + signed video URLs), `getShoeByEan`, `getSplitVideoUrl`. Server functions, service-role.                                          |
| **Auth**               | `src/lib/access.functions.ts`                                                                                      | `exchangeAccessToken` (magic `?k=` token) + `signInWithUsername` (fallback). Mints a `viewer@local.app` session.                                                   |
| **Auth plumbing**      | `src/integrations/supabase/auth-middleware.ts` (server guard), `start.ts` (`attachSupabaseAuth` client middleware) | Server fns require a valid Bearer; the browser auto-attaches the viewer's token to every RPC.                                                                      |
| **Supabase clients**   | `src/integrations/supabase/client.ts` (browser, anon key), `client.server.ts` (service role, bypasses RLS)         | Two clients: public for the browser/realtime, admin for server fns.                                                                                                |
| **Colour map**         | `src/lib/sales-colors.ts`                                                                                          | `hexForSalesColor(name)` → the bottom drape colour.                                                                                                                |
| **SSR error handling** | `src/server.ts`, `src/start.ts`, `src/lib/error-page.ts`, `error-capture.ts`                                       | Wraps catastrophic SSR errors (h3 swallows in-handler throws into a JSON 500) into a branded error page.                                                           |
| **Root/shell**         | `src/routes/__root.tsx`                                                                                            | HTML shell, QueryClient provider, 404 + error components.                                                                                                          |
| **Deploy**             | `wrangler.jsonc`, `vite.config.ts`                                                                                 | Cloudflare Worker; entry redirected to `src/server.ts`. Vite config comes from `@lovable.dev/vite-tanstack-config` (don't add plugins manually — it bundles them). |
| **DB schema**          | `supabase/migrations/*.sql`                                                                                        | The five migrations that build the tables below.                                                                                                                   |

---

## 4. Data model (the app's own Supabase project)

**Project:** `nngfmzevsttpnxhgffit` (Lovable Cloud Supabase). **RLS is ON.**

| Table                        | Keyed by                        | Holds / role                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shoes`                      | `ean`                           | **The flat catalog.** ~40 columns: `commercial_name`, `sales_color_name`, `colorway`, the three 1–5 scales, `experience`, `ride_type`, `activity_type`, `activity_best_for`, `recommended_distance`, `technology` (comma text), stack heights, `weight_g`, `description(_short)`, `usps[]`, image columns (`gallery_image_url`, `highlight_image_urls[]`, `thumbnail_url`), **`lookbook_url`**, plus `style_code` / `product_code`. |
| `shoe_slots`                 | `side` (`left`/`right`, 2 rows) | Current shoe per side (the wall's live state). In the Realtime publication; `REPLICA IDENTITY FULL`.                                                                                                                                                                                                                                                                                                                                |
| `shoe_events`                | `id`                            | Append-only audit log of every scanned/swapped/removed event.                                                                                                                                                                                                                                                                                                                                                                       |
| `shoe_split_videos`          | `commercial_name`               | Maps a shoe → its demo video filename in the `shoe-assets` storage bucket (`splits/<filename>`).                                                                                                                                                                                                                                                                                                                                    |
| `shoe_image_urls`            | `ean`                           | A signed-URL cache table from an earlier design. ⚠️ The current code path coalesces image columns directly and does **not** read this table — likely legacy (confirm before relying on it).                                                                                                                                                                                                                                         |
| storage bucket `shoe-assets` | —                               | **Private.** All client access is via short-lived **signed URLs** minted server-side (service role). Explicit deny policies for anon/authenticated.                                                                                                                                                                                                                                                                                 |

> **The columns the UI actually uses** are listed in `SHOE_COLUMNS` in
> `shoes.functions.ts` and must stay in sync with the `Shoe` type in `index.tsx`.

### How reads work (fast by design)

- On boot (after auth) the app calls **`getShoeCatalog`** once: it returns every shoe
  (UI columns only, with a single coalesced `image_url`) **plus** a map of **pre-signed
  split-video URLs** keyed by `commercial_name` (7-day TTL, all signed up front).
- TanStack Query caches it (`staleTime: 1h`, `gcTime: Infinity`). Every scan is then
  resolved **synchronously from an in-memory `Map<ean, Shoe>`** — **zero per-scan server
  calls**. This is what keeps the wall instant and resilient to flaky in-store internet.

> Note on signing: `getSplitVideoUrl` calls Supabase Storage's REST `…/object/sign/…`
> endpoint via `fetch` rather than the SDK's `createSignedUrl()`, because the SDK
> returns a spurious "Object not found" inside the Cloudflare Worker runtime.

---

## 5. Auth & trust model

There are **two trust zones**, mirroring the spec:

1. **The wall (display).** Signs in as a read-only **`viewer@local.app`** user. Entry:
   - **Magic token:** open `/?k=<VIEWER_ACCESS_TOKEN>`. `exchangeAccessToken` validates
     it (constant-time compare) and mints a viewer session; the `k` is then stripped
     from the URL. This is how the kiosk auto-logs-in unattended.
   - **Fallback:** a username/password form (`signInWithUsername`); username must be
     `viewer`/`user`, password = `VIEWER_PASSWORD`.
2. **The scanner (bridge).** Hits the public ingest endpoint with
   `Authorization: Bearer <NODE_RED_PASSWORD>`. No Supabase session needed.

**Service users:** `viewer@local.app` and `node-red@local.app` are auto-created if
missing (`ensureUser`). Important subtlety: we **never** reset their password on login —
Supabase revokes all refresh tokens on a password change, which would log out every
other kiosk/tab. So `ensureUser` only _creates_, never _updates_.

**Server-function guard:** every catalog/auth server fn is wrapped by
`requireSupabaseAuth`, which validates the Bearer token via `getClaims`. The browser
attaches that token automatically through the `attachSupabaseAuth` **client middleware**
registered in `start.ts` (without it, RPCs would go out unauthenticated).

**Secrets** (server-only env): `SUPABASE_SERVICE_ROLE_KEY`, `NODE_RED_PASSWORD`,
`VIEWER_PASSWORD`, `VIEWER_ACCESS_TOKEN`. Client-only: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`. Server also needs
`SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`.

**RLS:** `shoe_slots`/`shoe_events`/`shoes`/`shoe_split_videos` are authenticated-read;
Realtime `shoe-events` broadcast subscription is restricted to authenticated users; the
storage bucket is locked to service-role-only (signed URLs).

---

## 6. The contract with the bridge (the seam that's settled)

This is the **only** thing the app needs from the hardware side, and it already matches:

```
POST /api/public/ingest/shoe-event
Authorization: Bearer <NODE_RED_PASSWORD>
{ "event_type": "scanned|swapped|removed", "side": "left|right", "ean": "<EAN-13>" }
```

- `ean` omitted on `removed`.
- The emulator/bridge already post here and get HTTP 200.
- The app keys the catalog by **whatever EAN arrives** — so the open question is purely
  _which_ EAN population lives in `shoes` (see §7), not the wire format.

---

## 7. What's open (and why it matters)

1. **Catalog population — the big one (in flux).** The app reads its **own** flat
   `shoes` table, not TSC's `compare_wall`. _How that table gets filled_ is being
   decided internally. Leaning direction (not final): a **new Supabase DB** whose schema
   matches what **ON** will feed, and the installation **downloads a daily local copy**
   (offline-first, re-fetched on restart). Until settled, the live constraint stands:
   **real shoe tags only resolve if the `shoes` table is keyed by the Sample EAN** the
   bridge decodes (today the hardware side hard-codes 4 test tags onto catalog EANs as a
   stopgap — see the bridge handover §3.1).
2. **Lookbook images + split videos — no confirmed source.** The plumbing exists
   (`lookbook_url`, `shoe_split_videos`, the `shoe-assets` bucket), but where the actual
   assets come from (the ON-fed DB? hosted separately?) is undecided.
3. **Final deploy domain + webhook token.** Currently `on-compare-wall.lovable.app` with
   a dev `NODE_RED_PASSWORD`. Both change at go-live; the bridge's `config.toml` must be
   pointed at the final values.
4. **Likely-legacy bits to confirm/remove:** the `shoe_image_urls` table (current code
   doesn't read it) and `supabase/config.toml`'s `[functions.shoe-events]` edge-function
   stub (ingest is now a TanStack server route, not an edge function).

---

## 8. Running it locally

```bash
bun install
bun dev          # vite dev server
bun run build    # production build (Cloudflare Worker)
bun run lint
```

Needs the env vars from §5 (a local `.env` holds the Supabase URL + publishable key;
the service-role key and the three passwords/tokens are set in the deploy environment).
Open `/?k=<VIEWER_ACCESS_TOKEN>` to auth as the wall, or use the username/password form.
Drive it without hardware via the emulator (in the other repo) posting to the ingest
endpoint — the app can't tell a real tag from an emulator click.

---

## 9. Mini-glossary

- **Slot:** one of the two stands, `left` / `right`. `shoe_slots` is the live state.
- **Broadcast vs DB write:** the app reacts to a Realtime _broadcast_ (fast), and
  _separately_ persists to `shoe_slots`/`shoe_events` (audit). Broadcast comes first.
- **Catalog prefetch:** the one-time download of the whole `shoes` table at boot, after
  which every scan is resolved in memory with no further server calls.
- **Key Look:** the full-height lookbook image shown on the empty half when only one
  shoe is present (`lookbook_url`).
- **Vuplex:** the embedded-Chromium kiosk runtime — the reason all scaling is done in JS
  with plain `px` values instead of CSS math.
- **viewer / node-red users:** the two service accounts — the display logs in as
  `viewer@local.app`; the scanner authenticates as `node-red@local.app` via bearer.

---

_Counterpart to the hardware/data handovers in the other repo. The events seam (§6) is
the most settled; the catalog-population model (§7.1) is the main thing still being
decided. If you're an AI reading this: start at §4 (data) and §7 (open questions)._
