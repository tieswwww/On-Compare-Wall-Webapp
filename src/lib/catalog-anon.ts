// CLIENT-ONLY. This module imports the browser Supabase client (which touches
// localStorage at load), so it must NEVER be imported by server-reachable code.
// Load it ONLY via a dynamic import inside a client-side code path (see the
// kiosk catalog queryFn in src/routes/index.tsx). It's intentionally not named
// `*.client.*` so a deliberate dynamic import isn't blocked by the build's
// import-protection guard — keep the dynamic-only rule by hand.
import { supabase } from "@/integrations/supabase/client";
import { CATALOG_RELATION, SHOE_COLUMNS } from "@/lib/catalog-columns";
import { selectImageUrl } from "@/lib/images";
import type { CatalogRow, Shoe } from "@/types/wall";

/**
 * Kiosk catalog read — client-side, anon key, no login.
 *
 * The installation has no viewer session, so it can't call the service-role
 * `getShoeCatalog` server fn. Instead it reads the **anon-readable**
 * `compare_wall` view directly with the publishable key. Returns the same
 * `{ shoes, splitVideos }` shape as the server fn so the wall renders
 * identically (see src/routes/index.tsx).
 *
 * Note: `splitVideos` is empty here. Those URLs are signed from a *private*
 * bucket, which needs service-role — not available to the anon kiosk. Split
 * videos are a separate (currently blocked) data track; offline split-video
 * delivery is part of the production-runtime work, not this path.
 * See docs/PRODUCTION-RUNTIME-DESIGN.md.
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

  return { shoes, splitVideos: {} };
}
