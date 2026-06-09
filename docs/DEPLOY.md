# Deploy — Cloudflare Workers

The ON Compare Wall deploys to **Cloudflare Workers** (it's a server-rendered
TanStack Start app, so it needs the Worker runtime — static hosting alone won't
run the ingest route / server functions).

This is a one-time setup per machine + a one-line deploy after that.

## How the build/deploy fits together

- `wrangler.jsonc` keeps `main: src/server.ts` — the **@cloudflare/vite-plugin
  builds the Worker from that source** during `vite build`. Don't change it.
- `wrangler deploy` can't run the Vite build itself, so deploy uses a second
  config, **`wrangler.deploy.jsonc`**, that points wrangler at the already-built
  output (`dist/server/server.js` + the `dist/client` assets).
- `bun run deploy` does both: `vite build && wrangler deploy -c wrangler.deploy.jsonc`.

## One-time setup

### 1. Log in to Cloudflare

```sh
bunx wrangler login
```

Opens a browser; authorize with your Cloudflare account. (Free tier is fine.)

### 2. Set the server secrets

The server reads these at runtime. They are **secrets** — set them on the Worker
with `wrangler secret put` (encrypted, never in git). Each command prompts for the
value; paste it from your local `.env`.

```sh
bunx wrangler secret put SUPABASE_URL              -c wrangler.deploy.jsonc
bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY  -c wrangler.deploy.jsonc
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c wrangler.deploy.jsonc
bunx wrangler secret put NODE_RED_PASSWORD         -c wrangler.deploy.jsonc
bunx wrangler secret put VIEWER_PASSWORD           -c wrangler.deploy.jsonc
bunx wrangler secret put VIEWER_ACCESS_TOKEN       -c wrangler.deploy.jsonc
```

> Note: setting secrets the first time may ask to create the Worker
> (`on-compare-wall`) — say yes. If it refuses because the Worker doesn't exist
> yet, run `bun run deploy` once first (step below), then set the secrets.

### Build-time config (the browser bundle)

The **public** `VITE_*` vars are baked into the browser bundle **at build time**
from your local `.env` (not Worker secrets). The two that matter:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

So whatever is in `.env` when you run `bun run deploy` is what ships. Keep `.env`
correct (it already is for local dev).

## Deploy

```sh
bun run deploy
```

Builds, then uploads to Cloudflare. It prints the live URL (e.g.
`https://on-compare-wall.<your-subdomain>.workers.dev`). That's the URL TSS Play
loads. Re-run this any time to ship an update.

## Verify after deploy

1. Open the URL — you should get the login screen (or the wall if a session
   exists).
2. Test the ingest endpoint (replace the bearer with your `NODE_RED_PASSWORD`):
   ```sh
   curl -X POST https://<your-url>/api/public/ingest/shoe-event \
     -H "Authorization: Bearer <NODE_RED_PASSWORD>" \
     -H "Content-Type: application/json" \
     -d '{"event_type":"scanned","side":"left","ean":"7615537532448"}'
   ```
   Expect `{"ok":true}`.

## Kiosk vs admin build

The hosted URL above is the **admin/browser** build (login gate + Supabase
Realtime). The kiosk flags (`VITE_KIOSK_MODE`, `VITE_EVENT_TRANSPORT=mqtt`) are
**build-time**, so the installation needs a build with those set. Options when we
get to the POS step: a second deploy built with the kiosk env, or make the flags
URL-overridable so one deploy serves both. See docs/PRODUCTION-RUNTIME-DESIGN.md.

## Notes / gotchas

- **Asset size:** Cloudflare caps a single static asset at **25 MiB**.
  `public/idle-bg.mp4` was re-encoded (4K HEVC 29 MiB → H.264 10 MiB) to fit and
  to play reliably in Chromium/Vuplex. Keep new assets under the limit.
- `wrangler.deploy.jsonc` contains **no secrets** — safe to commit.
- First deploy on a fresh account also provisions a free `*.workers.dev`
  subdomain; you can attach a custom domain later in the Cloudflare dashboard.
