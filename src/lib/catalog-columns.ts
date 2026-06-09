// Shared catalog-source definition, used by BOTH the server fn
// (src/lib/shoes.functions.ts, service-role read) and the kiosk client path
// (src/lib/catalog.client.ts, anon read of the public `compare_wall` view).
//
// Keep this list in sync with `CatalogRow` / `Shoe` in src/types/wall.ts and
// with the `compare_wall` view definition in on-showroom-data.

// The product catalog lives in `on-showroom-data` as the anon-readable
// `compare_wall` view (keyed by Sample EAN), built to match SHOE_COLUMNS 1:1.
export const CATALOG_RELATION = "compare_wall";

export const SHOE_COLUMNS = [
  "ean",
  "commercial_name",
  "sales_color_name",
  "colorway",
  "weight_g",
  "heel_stack_mm",
  "forefoot_stack_mm",
  "heel_drop_mm",
  "cushioning_scale",
  "responsiveness_scale",
  "stability_scale",
  "experience",
  "ride_type",
  "activity_type",
  "activity_best_for",
  "recommended_distance",
  "technology",
  "description_short",
  "description",
  "usps",
  "gallery_image_url",
  "highlight_image_urls",
  "thumbnail_url",
  "lookbook_url",
].join(",");
