import { MQTT_PASSWORD, MQTT_TOPIC, MQTT_URL, MQTT_USERNAME } from "@/config/runtime";
import { parseShoeEvent, type SlotTransport, type TransportCallbacks } from "./types";

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
          const event = parseShoeEvent(message.toString());
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
