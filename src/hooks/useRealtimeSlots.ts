import { useEffect, useState } from "react";
import type { AuthState, BroadcastPayload, Side, Slot } from "@/types/wall";

/**
 * Tracks which shoe is on each stand.
 *
 * Once authed: loads the current `shoe_slots` once, then subscribes to the
 * `shoe-events` Realtime broadcast and applies each scanned/swapped/removed
 * event in memory. Returns the live left/right slot state.
 */
export function useRealtimeSlots(authState: AuthState) {
  const [slots, setSlots] = useState<Record<Side, Slot>>({
    left: { side: "left", ean: null, updated_at: "" },
    right: { side: "right", ean: null, updated_at: "" },
  });

  useEffect(() => {
    if (authState !== "authed") return;
    if (typeof window === "undefined") return;

    let mounted = true;
    let removeRealtimeChannel: (() => void) | undefined;

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
          if (!data) return;
          setSlots((prev) => {
            const next = { ...prev };
            for (const row of data as Slot[]) next[row.side] = row;
            return next;
          });
        });

      const channel = supabase
        .channel("shoe-events")
        .on("broadcast", { event: "update" }, ({ payload }) => {
          const p = payload as BroadcastPayload;
          if (p.side !== "left" && p.side !== "right") return;
          const side = p.side;
          const ean = p.event_type === "removed" ? null : p.ean;
          setSlots((prev) => ({
            ...prev,
            [side]: { side, ean, updated_at: p.ts },
          }));
        })
        .subscribe();

      removeRealtimeChannel = () => {
        supabase.removeChannel(channel);
      };
    });

    return () => {
      mounted = false;
      removeRealtimeChannel?.();
    };
  }, [authState]);

  return slots;
}
