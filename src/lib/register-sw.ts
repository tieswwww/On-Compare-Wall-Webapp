import { KIOSK_MODE } from "@/config/runtime";

/**
 * Register the offline service worker — **kiosk only**. TSS Play doesn't reload
 * the asset offline, so the kiosk caches itself (see public/sw.js). The admin
 * build deliberately skips this (no stale-cache surprises in dev/admin).
 *
 * Requires a secure context (the kiosk URL is HTTPS, so this holds). After the
 * worker takes control, we hand it the URLs this page just loaded so it can
 * precache the shell explicitly (runtime caching alone can miss assets fetched
 * before the worker activated on the very first load).
 */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!KIOSK_MODE) return;
  if (!("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;

  const precacheShell = () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;
    // Same-origin only: the shell + hashed assets. Cross-origin media is handled
    // by the worker's runtime cache-first (avoids CORS issues here).
    const sameOrigin = (u: string) => {
      try {
        return new URL(u).origin === window.location.origin;
      } catch {
        return false;
      }
    };
    const urls = [
      window.location.href,
      ...performance
        .getEntriesByType("resource")
        .map((e) => (e as PerformanceResourceTiming).name)
        .filter(sameOrigin),
    ];
    controller.postMessage({ type: "precache", urls });
  };

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        if (navigator.serviceWorker.controller) {
          precacheShell();
        } else {
          navigator.serviceWorker.addEventListener("controllerchange", precacheShell, {
            once: true,
          });
        }
      })
      .catch((err) => console.error("[sw] registration failed", err));
  });
}
