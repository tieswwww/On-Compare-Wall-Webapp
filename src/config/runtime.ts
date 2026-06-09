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

/**
 * Where live scan events come from (see src/lib/transport):
 *   • `realtime` (default) — Supabase Realtime broadcast. Cloud; used in
 *     dev/admin and any online deployment.
 *   • `mqtt` — the local RabbitMQ Web-MQTT broker on the POS. Offline-capable;
 *     used by the installation.
 * Set `VITE_EVENT_TRANSPORT=mqtt` for the kiosk. Same `{event_type,side,ean}`
 * payload either way, so the slot logic is shared.
 */
export type EventTransport = "realtime" | "mqtt";
export const EVENT_TRANSPORT: EventTransport =
  import.meta.env.VITE_EVENT_TRANSPORT === "mqtt" ? "mqtt" : "realtime";

/**
 * MQTT (Web-MQTT over WebSocket) connection settings, used only when
 * EVENT_TRANSPORT === "mqtt". The bridge publishes scan events to the
 * `shoe-events` topic on the local RabbitMQ broker (rabbitmq_web_mqtt plugin).
 * Host/port/path/creds are confirmed per-POS — override via VITE_MQTT_*.
 */
export const MQTT_URL = import.meta.env.VITE_MQTT_URL ?? "ws://localhost:15672/ws";
export const MQTT_TOPIC = import.meta.env.VITE_MQTT_TOPIC ?? "shoe-events";
export const MQTT_USERNAME: string | undefined = import.meta.env.VITE_MQTT_USERNAME || undefined;
export const MQTT_PASSWORD: string | undefined = import.meta.env.VITE_MQTT_PASSWORD || undefined;
