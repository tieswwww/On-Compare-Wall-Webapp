import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";

/**
 * Height-only UI scaling for the wall.
 *
 * All scaling math runs in JavaScript and emits plain `Npx` strings to the DOM.
 * We deliberately avoid CSS `calc()`, `min()`, and length multiplication —
 * features the embedded Chromium in Vuplex (Quest/Android/UWP) evaluates
 * inconsistently, which previously caused every font-size to collapse to the
 * browser default and all margins/positions to drop.
 *
 * A single module-level `scale` is shared by every component; it's recomputed on
 * window resize AND on mount (see below). `useScaledUnits()` re-renders its
 * caller when it changes.
 */

// px value of 1 design-unit at the current viewport (1 = design height 1920).
let scale = 1;
const scaleListeners = new Set<() => void>();

function computeScale(): number {
  if (typeof window === "undefined") return 1;
  // Height-only, 1:1 linear scaling against the 1920px portrait design height.
  // Width has no effect. At 1920px tall → scale 1 (design size).
  return window.innerHeight / 1920;
}

// Recompute the shared scale and notify subscribers if it changed.
function recomputeScale(): void {
  const next = computeScale();
  if (next === scale) return;
  scale = next;
  scaleListeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  scale = computeScale();
  window.addEventListener("resize", recomputeScale);
}

// Apply the scale before paint on the client; fall back to useEffect on the
// server (no-op there, and avoids React's SSR useLayoutEffect warning).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Scaling helpers bound to the current viewport:
 * - `u(n)`  — spacing/size in px (n design-units).
 * - `ut(n)` — "text" px: 0.7× of `u`. The designed sizes were ~2× what reads
 *   well on screen, so text and text-adjacent spacing (gaps, letter-spacing)
 *   use this so they shrink together.
 * - `px(n)` — a `{ fontSize }` style built from `ut`.
 */
export function useScaledUnits() {
  const [, force] = useState(0);
  useIsomorphicLayoutEffect(() => {
    const rerender = () => force((x) => x + 1);
    scaleListeners.add(rerender);
    // Recompute against the ACTUAL viewport at mount, before paint. innerHeight
    // may not have been settled when the module first loaded (fresh tab, or the
    // Vuplex surface sizing late) — previously only a window resize recomputed
    // it, so the first paint could use a stale scale and render huge. This makes
    // the first frame correct without a resize.
    recomputeScale();
    rerender();
    return () => {
      scaleListeners.delete(rerender);
    };
  }, []);
  const u = (n: number): string => `${(n * scale).toFixed(2)}px`;
  const ut = (n: number): string => `${(n * scale * 0.7).toFixed(2)}px`;
  const px = (n: number): CSSProperties => ({ fontSize: ut(n) });
  return { u, ut, px };
}
