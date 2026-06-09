import { useEffect, useRef, useState } from "react";
import type { Shoe } from "@/types/wall";

// How many images to fetch at once — enough to be quick, few enough not to
// hammer the network / On's image CDN on boot.
const MAX_CONCURRENT = 6;

export type PreloadState = {
  total: number;
  loaded: number;
  progress: number; // 0..1
  done: boolean;
};

/**
 * Warms the browser cache with every catalog product image at boot, so a
 * scanned shoe's photo is already cached and fades in instantly (no download
 * jank on first scan). Throttled to a few concurrent requests; runs once per
 * session. Returns progress for the boot indicator (see PreloadProgress).
 *
 * Scope: this warms the in-session HTTP cache only. Surviving a restart / full
 * offline is a separate concern (a service worker), tied to the TSS runtime work
 * — see docs/WEBAPP-HANDOVER.md. To remove this feature: delete this hook +
 * PreloadProgress and their two usages in src/routes/index.tsx.
 */
export function useAssetPreloader(shoes: Shoe[] | undefined): PreloadState {
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!shoes || shoes.length === 0) return;
    if (startedRef.current) return; // once per session
    startedRef.current = true;

    const urls = Array.from(new Set(shoes.map((s) => s.image_url).filter((u): u is string => !!u)));
    setTotal(urls.length);
    if (urls.length === 0) return;

    let cancelled = false;
    let next = 0;
    let inFlight = 0;

    const pump = () => {
      if (cancelled) return;
      while (inFlight < MAX_CONCURRENT && next < urls.length) {
        const img = new Image();
        inFlight++;
        next++;
        const onSettled = () => {
          if (cancelled) return;
          inFlight--;
          setLoaded((n) => n + 1);
          pump();
        };
        img.onload = onSettled;
        img.onerror = onSettled; // count failures too so progress always completes
        img.src = urls[next - 1];
      }
    };
    pump();

    return () => {
      cancelled = true;
    };
  }, [shoes]);

  const progress = total === 0 ? 1 : loaded / total;
  const done = startedRef.current && loaded >= total;
  return { total, loaded, progress, done };
}
