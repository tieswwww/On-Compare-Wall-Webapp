import { WS_URL } from "@/config/runtime";
import type { Side, Slot } from "@/types/wall";
import { coerceShoeEvent, type SlotTransport, type TransportCallbacks } from "./types";

const RECONNECT_DELAY_MS = 2000;

/**
 * Message format the bridge's wall WebSocket sends (and this adapter expects):
 *
 *   • Snapshot (sent once on connect, so a freshly-loaded/reloaded wall
 *     re-syncs both stands immediately):
 *       { "type": "snapshot", "slots": { "left": "<ean>"|null, "right": "<ean>"|null } }
 *
 *   • Event (per scan/swap/removal, same shape as the webhook/MQTT payload):
 *       { "event_type": "scanned"|"swapped"|"removed", "side": "left"|"right",
 *         "ean": "<ean>" }   // ean omitted on "removed"
 *
 * Anything else is ignored. This is the contract the bridge endpoint matches.
 */

/** Build the initial Slot[] from a snapshot message, or null if malformed. */
function parseSnapshot(parsed: Record<string, unknown>): Slot[] | null {
  if (parsed.type !== "snapshot") return null;
  const slots = parsed.slots;
  if (typeof slots !== "object" || slots === null) return null;
  const s = slots as Record<string, unknown>;
  const ts = new Date().toISOString();
  const toSlot = (side: Side): Slot => ({
    side,
    ean: typeof s[side] === "string" ? (s[side] as string) : null,
    updated_at: ts,
  });
  return [toSlot("left"), toSlot("right")];
}

/**
 * Direct-WebSocket transport — the installation path (Option B).
 *
 * Connects to the bridge's wall WebSocket on the POS (localhost, offline, no
 * broker). Applies the snapshot on connect via `onSnapshot`, then forwards each
 * scan via `onEvent`. Auto-reconnects so the wall recovers if the bridge
 * restarts or the wall loads first.
 */
export function createWsTransport(): SlotTransport {
  return {
    start({ onEvent, onSnapshot }: TransportCallbacks) {
      let active = true;
      let socket: WebSocket | undefined;
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

      const connect = () => {
        if (!active) return;
        socket = new WebSocket(WS_URL);

        socket.onmessage = (e) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(typeof e.data === "string" ? e.data : "");
          } catch {
            return;
          }
          if (typeof parsed !== "object" || parsed === null) return;
          const rows = parseSnapshot(parsed as Record<string, unknown>);
          if (rows) {
            onSnapshot?.(rows);
            return;
          }
          const event = coerceShoeEvent(parsed);
          if (event) onEvent(event);
        };

        socket.onclose = () => {
          if (!active) return;
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        };
        socket.onerror = () => socket?.close(); // triggers onclose → reconnect
      };

      connect();

      return () => {
        active = false;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        socket?.close();
      };
    },
  };
}
