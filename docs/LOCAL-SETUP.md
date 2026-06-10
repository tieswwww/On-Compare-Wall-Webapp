# ON Compare Wall — Local Setup & Gotchas (on-showroom-data build)

> The web app running **locally** (not Lovable cloud), pointed at the TSC
> **`on-showroom-data`** Supabase as its single backend, and fed by the **fake
> reader / emulator** for testing. This file captures the non-obvious stuff so it
> doesn't get lost in chat.

---

## Architecture (this local build)

- **One Supabase project:** `on-showroom-data` (ref `dlcogzpcduadrshlxqrr`, Frankfurt).
  It mirrors ON's data and is the single backend — catalog **and** operational.
- **Catalog:** read from the **`compare_wall`** view (~943 rows, **Sample-EAN** keyed).
  The app reads it via `getShoeCatalog` (service role). All data shaping (joins,
  array→text) happens **in the view**, not the app. The app only reads + displays.
- **Operational tables:** `shoe_slots`, `shoe_events`, `shoe_split_videos`, the private
  `shoe-assets` bucket, Realtime + RLS — created in `on-showroom-data` by
  [`docs/on-showroom-data-app-backend.sql`](./on-showroom-data-app-backend.sql).
- **Event flow:** reader/emulator → `POST /api/public/ingest/shoe-event`
  (`Authorization: Bearer <NODE_RED_PASSWORD>`) → Supabase Realtime broadcast → wall flips.
- **Runtime:** `bun run dev` → a Node/Nitro server on **http://localhost:8080**.

---

## Run it

```bash
bun install
bun run dev          # → http://localhost:8080
```

Log in either way:

- **Magic link:** `http://localhost:8080/?k=<VIEWER_ACCESS_TOKEN>`
- **Form:** username `viewer`, password `<VIEWER_PASSWORD>`

---

## Environment — the #1 gotcha

**Local dev reads `.env`, NOT `.dev.vars`.** `bun run dev` is a plain Node/Nitro
server; `.dev.vars` only matters for the Cloudflare/Wrangler _deploy_ path, which
this dev server doesn't use. So **all local config — including secrets — goes in
`.env`** (which is gitignored, so that's safe).

> Symptom if a secret is missing/in the wrong file: the login shows **"Invalid
> username or password"** — which really means _the server couldn't read its env_
> (it surfaces every login error with that one generic message).

**`VITE_` vs plain names:** `VITE_*` vars are exposed to the **browser**; plain names
are **server-only** (`process.env`). The app has two Supabase connections (browser +
server), so the same URL + anon key appear under both names. That's expected, not a duplicate bug.

**Required vars (all in `.env`):**

| Var                                                          | Used by           | Where to get it                                            |
| ------------------------------------------------------------ | ----------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` / `VITE_SUPABASE_URL`                         | server / browser  | Supabase → on-showroom-data → Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | server / browser  | same page → anon / publishable key                         |
| `VITE_SUPABASE_PROJECT_ID`                                   | browser           | `dlcogzpcduadrshlxqrr`                                     |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | server            | same page → **service_role** (secret)                      |
| `NODE_RED_PASSWORD`                                          | ingest auth       | **you invent** (emulator/bridge must use the same value)   |
| `VIEWER_PASSWORD`                                            | viewer login      | **you invent**                                             |
| `VIEWER_ACCESS_TOKEN`                                        | magic-link `/?k=` | **you invent**                                             |

`.env.example` documents these with no values. **Restart `bun run dev` after editing `.env`** (env is read at startup).

---

## Gotchas (the not-obvious stuff)

1. **Secrets live in `.env`, not `.dev.vars`** (see above). `.dev.vars` is unused for `bun run dev`.
2. **The `viewer` password is locked after first login.** The app creates
   `viewer@local.app` with `VIEWER_PASSWORD` **once** and never updates it (changing a
   Supabase password revokes all sessions, which would log out every kiosk). **To change
   it:** Supabase → Authentication → Users → delete `viewer@local.app`, then it's
   recreated from `.env` on the next login. Same applies to `node-red@local.app`.
3. **Catalog is a read-only view.** `compare_wall` can't be written by the app — it only
   reads. Catalog content/shape is owned upstream (opus_ties / ON feed).
4. **`on-showroom-data` is ON-mirrored.** If it's ever rebuilt from ON's feed, the app's
   operational objects could be wiped — **re-run `on-showroom-data-app-backend.sql`** and
   the `viewer`/`node-red` users will re-create on next login.
5. **Data sparsity is normal (for now).** Some shoes have null image/video/weight/stats in
   `compare_wall`. The wall renders fine; those just look bare. That's a data-population
   issue, not a bug.
6. **Port 8080 is shared.** The wall dev server uses 8080; the emulator UI **also defaults
   to 8080** — run the emulator on a different port (see Testing).
7. **`NODE_RED_PASSWORD` is a shared secret.** The value in `.env` must match the bearer
   token the emulator/bridge sends, or ingest returns 401.
8. **Realtime transport.** Today scans flip the wall via Supabase Realtime (cloud
   broadcast). The production direction is **local MQTT** (offline-first) — a future
   change; the JSON payload (`{event_type, side, ean}`) stays the same.

---

## Testing with the fake reader / emulator (no hardware)

The emulator lives in the **other repo** (`on-compare-grid/emulator/`). It posts the same
webhook the real bridge does. Two ways to drive the wall:

### A) Quick test — `curl` (zero changes anywhere)

With the wall running, fire events at it directly (use an EAN that exists in
`compare_wall`, e.g. Cloudboom Max `7615537532448`):

```bash
curl -X POST http://localhost:8080/api/public/ingest/shoe-event \
  -H "Authorization: Bearer <NODE_RED_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"scanned","side":"left","ean":"7615537532448"}'
# remove:  -d '{"event_type":"removed","side":"left"}'
```

### B) Emulator UI (nicer, repeatable)

opus_ties made the emulator's target/token/UI-port **env-overridable** (defaults unchanged).
Point it at the local wall and run its UI on a non-colliding port (8090):

```bash
cd on-compare-grid/emulator
EMU_WEBHOOK_URL=http://localhost:8080/api/public/ingest/shoe-event \
EMU_WEBHOOK_BEARER=<NODE_RED_PASSWORD> EMU_UI_PORT=8090 \
PYTHONPATH=.. ./.venv/bin/python main.py
# emulator UI → http://localhost:8090 (wall stays on :8080). Click Place / Swap / Remove.
```

- `EMU_WEBHOOK_BEARER` = the app's `NODE_RED_PASSWORD` (Ties shares it privately).
- Pick shoes whose EANs are in `compare_wall` (the emulator's `eans.txt` is a mix — the
  Cloudboom Max entries resolve). The emulator boots in **emulate** (button) mode — no hardware needed.
- **Drive multiple walls at once:** `EMU_WEBHOOK_URL` + `EMU_WEBHOOK_BEARER` accept
  comma-separated lists (e.g. the live (Cloudflare-hosted) wall AND a local wall from one emulator).

---

## Reference

- **Supabase:** `on-showroom-data`, ref `dlcogzpcduadrshlxqrr` (Frankfurt).
- **Ops SQL:** [`docs/on-showroom-data-app-backend.sql`](./on-showroom-data-app-backend.sql)
- **Catalog view:** `compare_wall` (~943 rows, Sample-EAN keyed).
- **Repo:** `github.com/tieswwww/On-Compare-Wall-Webapp` (branch `main`).
- **Full app reference:** [`docs/WEBAPP-HANDOVER.md`](./WEBAPP-HANDOVER.md).
