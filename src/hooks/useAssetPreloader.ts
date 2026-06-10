import { useEffect, useRef, useState } from "react";
import type { Shoe } from "@/types/wall";

// How many assets to fetch at once — enough to be quick, few enough not to
// hammer the network / On's CDN on boot.
const MAX_CONCURRENT = 6;

export type PreloadState = {
  total: number;
  loaded: number;
  progress: number; // 0..1
  done: boolean;
};

type Asset = { url: string; kind: "image" | "video" };

/**
 * Warms the browser cache with every catalog product image AND split video at
 * boot, so a scanned shoe's media is already cached and appears instantly (no
 * download jank on first scan). Throttled to a few concurrent requests; runs
 * once per session. Returns progress for the boot indicator (see PreloadProgress).
 *
 * Scope: this warms the in-session HTTP cache only. Surviving a restart / full
 * offline is a separate concern (a service worker), tied to the TSS runtime work
 * — see docs/WEBAPP-HANDOVER.md. To remove this feature: delete this hook +
 * PreloadProgress and their two usages in src/routes/index.tsx.
 */
export function useAssetPreloader(
  shoes: Shoe[] | undefined,
  splitVideos: Record<string, string> | undefined,
): PreloadState {
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shoes || shoes.length === 0) return;
    if (startedRef.current) return; // once per session
    startedRef.current = true;

    const imageUrls = Array.from(
      new Set(shoes.map((s) => s.image_url).filter((u): u is string => !!u)),
    );
    const videoUrls = Array.from(new Set(Object.values(splitVideos ?? {})));
    const assets: Asset[] = [
      ...imageUrls.map((url): Asset => ({ url, kind: "image" })),
      ...videoUrls.map((url): Asset => ({ url, kind: "video" })),
    ];
    setTotal(assets.length);
    if (assets.length === 0) return;

    let cancelled = false;
    let next = 0;
    let inFlight = 0;

    // Images preload via <img>; videos via fetch().blob() to force a full
    // download (fetch alone resolves on headers, not the whole file). Either
    // way we count on settle — successes and failures — so progress completes.
    const preload = (asset: Asset, onSettled: () => void) => {
      if (asset.kind === "video") {
        fetch(asset.url)
          .then((r) => r.blob())
          .then(onSettled, onSettled);
        return;
      }
      const img = new Image();
      img.onload = onSettled;
      img.onerror = onSettled;
      img.src = asset.url;
    };

    const pump = () => {
      if (cancelled) return;
      while (inFlight < MAX_CONCURRENT && next < assets.length) {
        const asset = assets[next];
        inFlight++;
        next++;
        preload(asset, () => {
          if (cancelled) return;
          inFlight--;
          setLoaded((n) => n + 1);
          pump();
        });
      }
    };
    pump();

    return () => {
      cancelled = true;
    };
  }, [shoes, splitVideos]);

  const progress = total === 0 ? 1 : loaded / total;
  const done = startedRef.current && loaded >= total;
  return { total, loaded, progress, done };
}
