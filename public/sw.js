// ON Compare Wall — offline service worker (kiosk only).
//
// TSS Play does NOT reload the asset offline (a no-internet restart shows
// "unable to load content"), so the app caches itself. After one full ONLINE
// session it serves the app shell, catalog reads, and media from the Cache API
// when there's no internet — so the wall boots and renders offline; live scans
// still come from the local bridge WebSocket.
//
// Strategy:
//   • HTML document + Supabase REST (catalog/map) → network-first (fresh online,
//     cached offline).
//   • App-shell assets, Supabase storage (split videos), images/videos →
//     cache-first (content-hashed / immutable-ish).
// Bump CACHE to invalidate everything on a breaking change.

const CACHE = "compare-wall-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// The page sends the URLs it just loaded (the shell + hashed assets) so we can
// precache them explicitly — runtime caching alone can miss assets fetched
// before the worker took control on the very first load.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "precache" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        data.urls.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res && res.ok) await cache.put(url, res.clone());
          } catch {
            /* ignore individual failures */
          }
        }),
      );
    })(),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit =
      (await cache.match(request)) ||
      (request.mode === "navigate" ? await cache.match("/") : undefined);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const isSupabase = url.hostname.endsWith(".supabase.co");

  // Fresh-when-online, cached-when-offline: the HTML doc + catalog/map reads.
  if (request.mode === "navigate" || (isSupabase && url.pathname.startsWith("/rest/"))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Immutable-ish: app-shell assets (same origin), storage media, images/videos.
  const sameOrigin = url.origin === self.location.origin;
  const isStorage = isSupabase && url.pathname.includes("/storage/");
  const isMedia =
    request.destination === "image" ||
    request.destination === "video" ||
    /\.(png|jpe?g|webp|avif|gif|svg|webm|mp4)$/i.test(url.pathname);
  if (sameOrigin || isStorage || isMedia) {
    event.respondWith(cacheFirst(request));
  }
});
