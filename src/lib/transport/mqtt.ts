import { MQTT_PASSWORD, MQTT_TOPIC, MQTT_URL, MQTT_USERNAME } from "@/config/runtime";
import type { BroadcastPayload, Side } from "@/types/wall";
import type { ShoeEvent, SlotTransport, TransportCallbacks } from "./types";

/**
 * Parse + validate a raw MQTT message body into a ShoeEvent, or null if it
 * isn't a well-formed scan event. The bridge sends the same JSON as the webhook
 * (`{event_type, side, ean}`, `ean` omitted on `removed`); `previous_ean`/`ts`
 * may be absent, so we fill sensible defaults.
 */
export function parseMqttEvent(raw: string): ShoeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const p = parsed as Record<string, unknown>;
  const eventType = p.event_type;
  if (eventType !== "scanned" && eventType !== "swapped" && eventType !== "removed") return null;
  if (p.side !== "left" && p.side !== "right") return null;

  return {
    event_type: eventType,
    side: p.side as Side,
    ean: typeof p.ean === "string" ? p.ean : null,
    previous_ean: typeof p.previous_ean === "string" ? p.previous_ean : null,
    ts: typeof p.ts === "string" ? p.ts : new Date().toISOString(),
  } satisfies BroadcastPayload;
}

/**
 * MQTT (Web-MQTT over WebSocket) transport — the installation path.
 *
 * Connects to the local RabbitMQ broker on the POS, subscribes to the
 * `shoe-events` topic, and forwards each scan event. Offline-capable: the broker
 * is local, so this keeps working with no internet. No snapshot — kiosk slot
 * state is in-memory and starts empty (see docs/PRODUCTION-RUNTIME-DESIGN.md).
 */
export function createMqttTransport(): SlotTransport {
  return {
    start({ onEvent }: TransportCallbacks) {
      let active = true;
      let end: (() => void) | undefined;

      import("mqtt").then(({ default: mqtt }) => {
        if (!active) return;

        const client = mqtt.connect(MQTT_URL, {
          username: MQTT_USERNAME,
          password: MQTT_PASSWORD,
          reconnectPeriod: 2000, // retry the local broker every 2s if it drops
        });

        client.on("connect", () => {
          client.subscribe(MQTT_TOPIC, (err) => {
            if (err) console.error("[mqtt] subscribe failed", MQTT_TOPIC, err.message);
          });
        });

        client.on("message", (_topic, message) => {
          const event = parseMqttEvent(message.toString());
          if (event) onEvent(event);
        });

        client.on("error", (err) => console.error("[mqtt] connection error", err.message));

        end = () => client.end(true);
      });

      return () => {
        active = false;
        end?.();
      };
    },
  };
}
