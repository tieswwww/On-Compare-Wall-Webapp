// Runtime configuration — switches the app between its two deployment shapes
// from a single build (see docs/PRODUCTION-RUNTIME-DESIGN.md):
//
//   • Browser / admin preview (default): viewer login gate, catalog via the
//     service-role server fn, events via Supabase Realtime.
//   • Kiosk (the TSS Play installation): no login, catalog read directly from
//     the anon-readable `compare_wall` view, runs unattended on the POS.
//
// Everything is driven by VITE_* env vars so behaviour is config, not a
// separate build. Defaults are the browser/admin shape — kiosk is opt-in.

/**
 * Kiosk mode: skip the viewer login and read the catalog with the anon key.
 * Enable for the installation by setting `VITE_KIOSK_MODE=true`. Off by default
 * so the normal browser/admin flow (login gate + server fn) is unchanged.
 */
export const KIOSK_MODE = import.meta.env.VITE_KIOSK_MODE === "true";
