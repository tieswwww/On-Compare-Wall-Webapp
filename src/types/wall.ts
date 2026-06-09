/**
 * Shared types for the compare-wall UI.
 *
 * Kept in one place so the route, hooks, and components all agree on the shape
 * of a shoe, a slot, and the realtime event payload.
 */

/** Which physical stand a shoe sits on. */
export type Side = "left" | "right";

/** Current state of one stand (mirrors a `shoe_slots` row). */
export type Slot = { side: Side; ean: string | null; updated_at: string };

/** Payload broadcast on the `shoe-events` Realtime channel by the ingest handler. */
export type BroadcastPayload = {
  event_type: "scanned" | "swapped" | "removed";
  side: Side | null;
  ean: string | null;
  previous_ean: string | null;
  ts: string;
};

/** Auth gate state for the wall. */
export type AuthState = "checking" | "authed" | "denied";

/**
 * A shoe as the wall UI consumes it: the catalog columns the wall renders, plus
 * a single coalesced `image_url` (the server picks gallery → highlight → thumbnail).
 * Keep in sync with `SHOE_COLUMNS` in `src/lib/shoes.functions.ts`.
 */
export type Shoe = {
  ean: string;
  commercial_name: string | null;
  sales_color_name: string | null;
  colorway: string | null;
  weight_g: number | null;
  heel_stack_mm: number | null;
  forefoot_stack_mm: number | null;
  heel_drop_mm: number | null;
  cushioning_scale: number | null;
  responsiveness_scale: number | null;
  stability_scale: number | null;
  experience: string | null;
  ride_type: string | null;
  activity_type: string | null;
  activity_best_for: string | null;
  recommended_distance: string | null;
  technology: string | null;
  description_short: string | null;
  description: string | null;
  usps: string[] | null;
  image_url: string | null;
  lookbook_url: string | null;
};

/**
 * A raw catalog row as selected from the `compare_wall` view (the SHOE_COLUMNS
 * list in src/lib/shoes.functions.ts). It carries the three image-source
 * columns; the UI `Shoe` collapses those into a single `image_url` via
 * `selectImageUrl` (src/lib/images.ts).
 */
export type CatalogRow = Omit<Shoe, "image_url"> & {
  gallery_image_url: string | null;
  highlight_image_urls: string[] | null;
  thumbnail_url: string | null;
};
