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

Do these **in order**. Each command is ONE line — paste the whole line, then
press Enter. (If `-c wrangler.deploy.jsonc` ends up on its own line you'll get
`command not found: -c` — it must stay on the same line as the rest.)

### 1. Log in to Cloudflare

```sh
bunx wrangler login
```

Opens a browser; authorize with your Cloudflare account. (Free tier is fine.)

### 2. Create the Worker by deploying once

This creates the Worker on your account (named `on-compare-wall`) so the secrets
have somewhere to go. The app won't fully work until step 3, that's expected.

```sh
bun run deploy
```

If it asks to create a new Worker called `on-compare-wall`, say **yes**. It
prints the live URL when done.

### 3. Set the server secrets

The server reads these at runtime. They're **secrets** (encrypted, never in git).
Run each line, press Enter, then paste the value from your local `.env` at the
`Enter a secret value:` prompt and press Enter again. One at a time:

```sh
bunx wrangler secret put SUPABASE_URL -c wrangler.deploy.jsonc
bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY -c wrangler.deploy.jsonc
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c wrangler.deploy.jsonc
bunx wrangler secret put NODE_RED_PASSWORD -c wrangler.deploy.jsonc
bunx wrangler secret put VIEWER_PASSWORD -c wrangler.deploy.jsonc
bunx wrangler secret put VIEWER_ACCESS_TOKEN -c wrangler.deploy.jsonc
```

(The Worker already exists from step 2, so these won't prompt to create it.)
Secrets take effect immediately — no need to redeploy after setting them.

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
   curl -X POST https://on-compare-wall.ties-webers.workers.dev/api/public/ingest/shoe-event \
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

- **Asset size:** Cloudflare caps a single static asset at **25 MiB**. Keep new
  assets (videos especially) under the limit. (An orphan `public/idle-bg.mp4` —
  a 28.5 MiB 4K clip not referenced anywhere in the app — was removed for this
  reason; the idle screen is the ON logo, no video.)
- `wrangler.deploy.jsonc` contains **no secrets** — safe to commit.
- First deploy on a fresh account also provisions a free `*.workers.dev`
  subdomain; you can attach a custom domain later in the Cloudflare dashboard.
