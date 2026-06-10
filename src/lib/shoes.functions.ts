import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CatalogRow } from "@/types/wall";
import { selectImageUrl } from "@/lib/images";
import { CATALOG_RELATION, SHOE_COLUMNS } from "@/lib/catalog-columns";
import { buildSplitVideoMap } from "@/lib/split-videos";

// CATALOG_RELATION / SHOE_COLUMNS are defined in src/lib/catalog-columns.ts and
// shared with the kiosk anon-read path. The app's operational tables
// (shoe_slots/shoe_events/shoe_split_videos) live in the same on-showroom-data
// project. See docs/WEBAPP-HANDOVER.md.

export const getShoeByEan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ean: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    const { data: shoe } = await supabaseAdmin
      .from(CATALOG_RELATION)
      .select(SHOE_COLUMNS)
      .eq("ean", data.ean)
      .maybeSingle<CatalogRow>();

    if (!shoe) return { shoe: null };

    return { shoe: { ...shoe, image_url: selectImageUrl(shoe) } };
  });

// Full catalog prefetch. Returns every shoe (used columns only) and a
// split-video public URL keyed by commercial_name, so the client can resolve
// every EAN scan locally without any further server calls.
export const getShoeCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: shoesRows, error: shoesErr } = await supabaseAdmin
      .from(CATALOG_RELATION)
      .select(SHOE_COLUMNS)
      .returns<CatalogRow[]>();
    if (shoesErr) throw new Error(shoesErr.message);

    const shoes = (shoesRows ?? []).map((shoe) => {
      // Strip the image-source columns from the wire payload — the client only
      // needs the single coalesced image_url.
      const { gallery_image_url: _g, highlight_image_urls: _h, thumbnail_url: _t, ...rest } = shoe;
      return { ...rest, image_url: selectImageUrl(shoe) };
    });

    const { data: splitRows, error: splitErr } = await supabaseAdmin
      .from("shoe_split_videos")
      .select("commercial_name,video_filename");
    if (splitErr) throw new Error(splitErr.message);

    // The shoe-assets bucket is public-read, so build a stable public URL per
    // split video (no signing/expiry; cacheable for offline). Same helper the
    // kiosk anon path uses, so both produce identical URLs.
    const supabaseUrl = process.env.SUPABASE_URL!;
    const splitVideos = buildSplitVideoMap(supabaseUrl, splitRows ?? []);

    return { shoes, splitVideos };
  });
