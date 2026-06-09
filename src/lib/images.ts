import type { CatalogRow } from "@/types/wall";

/**
 * Pick the best available product image for a catalog row:
 * gallery image → first highlight image → thumbnail (or null if none exist).
 *
 * Shared so `getShoeByEan` and `getShoeCatalog` collapse the three image-source
 * columns into one `image_url` the same way.
 */
export function selectImageUrl(
  row: Pick<CatalogRow, "gallery_image_url" | "highlight_image_urls" | "thumbnail_url">,
): string | null {
  return row.gallery_image_url ?? row.highlight_image_urls?.[0] ?? row.thumbnail_url ?? null;
}
