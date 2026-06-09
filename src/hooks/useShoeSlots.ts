import { useEffect, useState } from "react";
import { EVENT_TRANSPORT } from "@/config/runtime";
import type { AuthState, Side, Slot } from "@/types/wall";
import { applyShoeEvent, emptySlots, type SlotTransport } from "@/lib/transport/types";
import { createRealtimeTransport } from "@/lib/transport/realtime";
import { createMqttTransport } from "@/lib/transport/mqtt";
import { createWsTransport } from "@/lib/transport/ws";

function createTransport(): SlotTransport {
  switch (EVENT_TRANSPORT) {
    case "mqtt":
      return createMqttTransport();
    case "ws":
      return createWsTransport();
    default:
      return createRealtimeTransport();
  }
}

/**
 * Tracks which shoe is on each stand, fed by a pluggable event transport
 * (Supabase Realtime in dev/cloud, local MQTT in the kiosk — chosen by
 * EVENT_TRANSPORT). The slot-update logic (`applyShoeEvent`) is shared across
 * transports. Returns the live left/right slot state.
 */
export function useShoeSlots(authState: AuthState) {
  const [slots, setSlots] = useState<Record<Side, Slot>>(emptySlots);

  useEffect(() => {
    if (authState !== "authed") return;
    if (typeof window === "undefined") return;

    const transport = createTransport();
    const teardown = transport.start({
      onEvent: (event) => setSlots((prev) => applyShoeEvent(prev, event)),
      onSnapshot: (rows) =>
        setSlots((prev) => {
          const next = { ...prev };
          for (const row of rows) next[row.side] = row;
          return next;
        }),
    });

    return teardown;
  }, [authState]);

  return slots;
}
