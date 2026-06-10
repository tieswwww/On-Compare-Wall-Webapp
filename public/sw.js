// Self-unregistering tombstone.
//
// The kiosk briefly used a caching service worker for offline boot. We've since
// removed it — the installation is assumed to be online, so aggressive offline
// caching isn't needed. This version registers no fetch handler (so it caches
// nothing), clears any caches the old worker created, and unregisters itself, so
// any device that picked up the old worker cleans up on its next online load.
//
// Safe to delete this file once we're confident no clients have the old worker
// registered (it's only fetched by browsers that already have a worker).
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    })(),
  );
});
