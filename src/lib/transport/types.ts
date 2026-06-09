import type { BroadcastPayload, Side, Slot } from "@/types/wall";

/**
 * A scan event, normalised to the same shape regardless of transport. Both the
 * Supabase Realtime broadcast and the MQTT payload are `{event_type, side, ean,
 * …}`, so adapters hand the hook this one type.
 */
export type ShoeEvent = BroadcastPayload;

/** Callbacks an adapter uses to push state up to the hook. */
export type TransportCallbacks = {
  /** A single scan/swap/removal event. */
  onEvent: (event: ShoeEvent) => void;
  /**
   * Optional full slot snapshot at startup (Realtime reads `shoe_slots` once on
   * connect). MQTT/kiosk is in-memory only and has no snapshot.
   */
  onSnapshot?: (rows: Slot[]) => void;
};

/**
 * An event source for the wall. `start` wires up the connection (it may do async
 * setup internally) and returns a teardown function to tear it down.
 */
export type SlotTransport = {
  start: (callbacks: TransportCallbacks) => () => void;
};

/** Fresh, empty slot state — nothing on either stand. */
export function emptySlots(): Record<Side, Slot> {
  return {
    left: { side: "left", ean: null, updated_at: "" },
    right: { side: "right", ean: null, updated_at: "" },
  };
}

/**
 * Apply one scan event to the slot state. Pure — no side effects — so it's
 * shared by every transport and easy to test. A `removed` event clears the
 * side; anything else sets that side's EAN.
 */
export function applyShoeEvent(prev: Record<Side, Slot>, event: ShoeEvent): Record<Side, Slot> {
  if (event.side !== "left" && event.side !== "right") return prev;
  const side = event.side;
  const ean = event.event_type === "removed" ? null : event.ean;
  return { ...prev, [side]: { side, ean, updated_at: event.ts } };
}
