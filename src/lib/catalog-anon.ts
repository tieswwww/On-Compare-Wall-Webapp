// CLIENT-ONLY. This module imports the browser Supabase client (which touches
// localStorage at load), so it must NEVER be imported by server-reachable code.
// Load it ONLY via a dynamic import inside a client-side code path (see the
// kiosk catalog queryFn in src/routes/index.tsx). It's intentionally not named
// `*.client.*` so a deliberate dynamic import isn't blocked by the build's
// import-protection guard — keep the dynamic-only rule by hand.
import { supabase } from "@/integrations/supabase/client";
import { CATALOG_RELATION, SHOE_COLUMNS } from "@/lib/catalog-columns";
import { selectImageUrl } from "@/lib/images";
import { buildSplitVideoMap } from "@/lib/split-videos";
import type { CatalogRow, Shoe } from "@/types/wall";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * Kiosk catalog read — client-side, anon key, no login.
 *
 * The installation has no viewer session, so it can't call the service-role
 * `getShoeCatalog` server fn. Instead it reads, with the publishable key, the
 * **anon-readable** `compare_wall` view plus `shoe_split_videos`, and builds the
 * same `{ shoes, splitVideos }` shape as the server fn so the wall renders
 * identically (see src/routes/index.tsx). Split URLs are public (the shoe-assets
 * bucket is public-read), so no signing/service-role is needed.
 */
export async function getCatalogFromView(): Promise<{
  shoes: Shoe[];
  splitVideos: Record<string, string>;
}> {
  const { data, error } = await supabase
    .from(CATALOG_RELATION)
    .select(SHOE_COLUMNS)
    .returns<CatalogRow[]>();
  if (error) throw new Error(error.message);

  const shoes = (data ?? []).map((row) => {
    // Drop the image-source columns; the wall only needs the coalesced URL.
    const { gallery_image_url: _g, highlight_image_urls: _h, thumbnail_url: _t, ...rest } = row;
    return { ...rest, image_url: selectImageUrl(row) };
  });

  // Split videos: read the (anon-readable) mapping and build public URLs.
  // Non-fatal — if the table isn't readable yet, the wall just shows no split.
  let splitVideos: Record<string, string> = {};
  const { data: splitRows, error: splitErr } = await supabase
    .from("shoe_split_videos")
    .select("commercial_name,video_filename");
  if (splitErr) {
    console.error("[kiosk] shoe_split_videos read failed", splitErr.message);
  } else {
    splitVideos = buildSplitVideoMap(SUPABASE_URL, splitRows ?? []);
  }

  return { shoes, splitVideos };
}
