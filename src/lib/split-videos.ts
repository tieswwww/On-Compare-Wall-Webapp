// Split-video URLs. Split (alpha/transparent) clips live in the **public-read**
// `shoe-assets` bucket under `splits/`, so we build stable public URLs — no
// signing, no expiry, and cacheable for offline. Shared by the service-role
// catalog fn (getShoeCatalog) and the kiosk anon path (getCatalogFromView), so
// both produce identical URLs.

const SPLITS_BUCKET = "shoe-assets";
const SPLITS_PREFIX = "splits";

/** Public URL for one split video file in the public `shoe-assets` bucket. */
export function splitVideoPublicUrl(supabaseUrl: string, filename: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${SPLITS_BUCKET}/${SPLITS_PREFIX}/${filename}`;
}

/** Build a `{ commercial_name → public URL }` map from shoe_split_videos rows. */
export function buildSplitVideoMap(
  supabaseUrl: string,
  rows: ReadonlyArray<{ commercial_name: string | null; video_filename: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.commercial_name && row.video_filename) {
      map[row.commercial_name] = splitVideoPublicUrl(supabaseUrl, row.video_filename);
    }
  }
  return map;
}
