import { useScaledUnits } from "@/hooks/useScaledUnits";
import type { PreloadState } from "@/hooks/useAssetPreloader";

/**
 * Small, on-brand boot indicator: a thin progress bar + "caching N%" along the
 * bottom of the idle screen while catalog images preload. Fades out when done.
 * Renders nothing when there's nothing to cache.
 */
export function PreloadProgress({ total, progress, done }: PreloadState) {
  const { u, ut, px } = useScaledUnits();
  if (total === 0) return null;
  const pct = Math.round(progress * 100);
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center"
      style={{
        bottom: u(80),
        width: u(420),
        opacity: done ? 0 : 1,
        transition: "opacity 400ms ease-in-out",
      }}
    >
      <div
        className="font-mono uppercase text-black/55"
        style={{ ...px(20), letterSpacing: ut(1.5), marginBottom: ut(12) }}
      >
        Caching media · {pct}%
      </div>
      <div className="w-full overflow-hidden rounded-full bg-black/10" style={{ height: u(4) }}>
        <div
          className="h-full bg-black/70"
          style={{ width: `${pct}%`, transition: "width 200ms ease-out" }}
        />
      </div>
    </div>
  );
}
