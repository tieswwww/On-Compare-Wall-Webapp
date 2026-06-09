import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Columns actually consumed by the wall UI. Keep in sync with the `Shoe`
// type in src/routes/index.tsx.
const SHOE_COLUMNS = [
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

// The product catalog now lives in `on-showroom-data` as the `compare_wall`
// view (keyed by Sample EAN), built to match SHOE_COLUMNS 1:1. The app's
// operational tables (shoe_slots/shoe_events/shoe_split_videos) live in the
// same project. See docs/WEBAPP-HANDOVER.md.
const CATALOG_RELATION = "compare_wall";

export const getShoeByEan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ean: z.string().min(1).max(32) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: shoe } = await supabaseAdmin
      .from(CATALOG_RELATION)
      .select(SHOE_COLUMNS)
      .eq("ean", data.ean)
      .maybeSingle<any>();

    if (!shoe) return { shoe: null };

    const imageUrl =
      shoe.gallery_image_url ??
      shoe.highlight_image_urls?.[0] ??
      shoe.thumbnail_url ??
      null;

    return { shoe: { ...shoe, image_url: imageUrl } };
  });

// Full catalog prefetch. Returns every shoe (used columns only) and a
// pre-signed split-video URL keyed by commercial_name, so the client can
// resolve every EAN scan locally without any further server calls.
export const getShoeCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: shoesRows, error: shoesErr } = await supabaseAdmin
      .from(CATALOG_RELATION)
      .select(SHOE_COLUMNS)
      .returns<any[]>();
    if (shoesErr) throw new Error(shoesErr.message);

    const shoes = (shoesRows ?? []).map((shoe: any) => {
      const image_url =
        shoe.gallery_image_url ??
        shoe.highlight_image_urls?.[0] ??
        shoe.thumbnail_url ??
        null;
      // Strip image source columns from the wire payload — only image_url is used.
      const {
        gallery_image_url: _g,
        highlight_image_urls: _h,
        thumbnail_url: _t,
        ...rest
      } = shoe;
      return { ...rest, image_url };
    });

    const { data: splitRows, error: splitErr } = await supabaseAdmin
      .from("shoe_split_videos")
      .select("commercial_name,video_filename");
    if (splitErr) throw new Error(splitErr.message);

    // Pre-sign every split video URL once (7-day TTL). 12 rows total today,
    // so this is cheap and removes the per-scan signing round-trip.
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const splitVideos: Record<string, string> = {};
    await Promise.all(
      (splitRows ?? []).map(async (row) => {
        const path = `splits/${row.video_filename}`;
        const res = await fetch(
          `${supabaseUrl}/storage/v1/object/sign/shoe-assets/${path}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
          },
        );
        if (!res.ok) {
          console.error(
            "[getShoeCatalog] sign failed",
            row.commercial_name,
            res.status,
          );
          return;
        }
        const { signedURL } = (await res.json()) as { signedURL: string };
        splitVideos[row.commercial_name] = `${supabaseUrl}/storage/v1${signedURL}`;
      }),
    );

    return { shoes, splitVideos };
  });

// In-memory cache of signed URLs keyed by commercial_name. The Worker
// instance keeps this between requests, so repeated scans of the same shoe
// reuse the same URL — the browser then gets a real cache hit instead of
// re-downloading the video on every scan.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SIGNED_URL_REFRESH_BEFORE_MS = 60 * 60 * 1000; // refresh within last hour
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export const getSplitVideoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ commercial_name: z.string().min(1).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    const cached = signedUrlCache.get(data.commercial_name);
    if (cached && cached.expiresAt - Date.now() > SIGNED_URL_REFRESH_BEFORE_MS) {
      return { url: cached.url };
    }

    const { data: row } = await supabaseAdmin
      .from("shoe_split_videos")
      .select("video_filename")
      .eq("commercial_name", data.commercial_name)
      .maybeSingle();

    if (!row) return { url: null };

    // Use the storage REST API directly. The supabase-js SDK's
    // createSignedUrl() returns "Object not found" inside the Cloudflare
    // Worker runtime for these files, even when the object clearly exists
    // (direct REST works). Calling the endpoint via fetch sidesteps the issue.
    const supabaseUrl = process.env.SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const path = `splits/${row.video_filename}`;
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/sign/shoe-assets/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      console.error("[getSplitVideoUrl] sign failed", res.status);
      return { url: null };
    }
    const { signedURL } = (await res.json()) as { signedURL: string };
    const url = `${supabaseUrl}/storage/v1${signedURL}`;
    signedUrlCache.set(data.commercial_name, {
      url,
      expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    });
    return { url };

  });
