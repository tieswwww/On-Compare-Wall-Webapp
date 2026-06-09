import type { BroadcastPayload, Slot } from "@/types/wall";
import type { SlotTransport, TransportCallbacks } from "./types";

/**
 * Supabase Realtime transport (the cloud / dev / admin path).
 *
 * On start: reads the current `shoe_slots` once for an initial snapshot, then
 * subscribes to the `shoe-events` broadcast channel and forwards each event.
 * (`shoe_slots` isn't anon-readable, so the snapshot is empty for the anon
 * kiosk — harmless; the kiosk uses the MQTT transport anyway.)
 */
export function createRealtimeTransport(): SlotTransport {
  return {
    start({ onEvent, onSnapshot }: TransportCallbacks) {
      let mounted = true;
      let removeChannel: (() => void) | undefined;

      import("@/integrations/supabase/client").then(({ supabase }) => {
        if (!mounted) return;

        supabase
          .from("shoe_slots")
          .select("*")
          .then(({ data, error }) => {
            if (!mounted) return;
            if (error) {
              console.error("Failed to load initial shoe_slots", error);
              return;
            }
            if (data) onSnapshot?.(data as Slot[]);
          });

        const channel = supabase
          .channel("shoe-events")
          .on("broadcast", { event: "update" }, ({ payload }) => {
            onEvent(payload as BroadcastPayload);
          })
          .subscribe();

        removeChannel = () => supabase.removeChannel(channel);
      });

      return () => {
        mounted = false;
        removeChannel?.();
      };
    },
  };
}
