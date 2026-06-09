import { useEffect, useRef, useState } from "react";
import type { Side } from "@/types/wall";
import { KEYLOOK_CLEAR_MS, KEYLOOK_TRANSITION_MS } from "@/constants/animation";

/**
 * Full-height "key look" lookbook image shown on the empty half when only one
 * shoe is present. Reveal is deferred until the image has decoded AND `delayMs`
 * has elapsed (so it doesn't pop in half-painted), then it fades + brightens in.
 */
export function KeyLookOverlay({
  side,
  url,
  delayMs = 0,
}: {
  side: Side | null;
  url: string | null;
  delayMs?: number;
}) {
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(url);
  const [displayedSide, setDisplayedSide] = useState<Side | null>(side);
  const [loaded, setLoaded] = useState(false);
  const [delayElapsed, setDelayElapsed] = useState(false);
  const [lit, setLit] = useState(false);

  // Always read the latest delay via a ref so this effect can depend only on
  // (url, side). Otherwise, when delayMs changes on a later render (e.g. once
  // prevBothRef flips back to false), the effect re-fires and arms a NEW,
  // shorter timer mid-transition.
  const delayRef = useRef(delayMs);
  delayRef.current = delayMs;

  // Start loading the image immediately when a new url arrives, but defer
  // the reveal until BOTH the image has decoded AND the delay has elapsed.
  useEffect(() => {
    if (url && side) {
      setDisplayedUrl(url);
      setDisplayedSide(side);
      setLoaded(false);
      setLit(false);
      setDelayElapsed(false);
      const t = setTimeout(() => setDelayElapsed(true), delayRef.current);
      return () => clearTimeout(t);
    }
    setDelayElapsed(false);
    const t = setTimeout(() => {
      setDisplayedUrl(null);
      setLoaded(false);
      setLit(false);
    }, KEYLOOK_CLEAR_MS);
    return () => clearTimeout(t);
  }, [url, side]);

  const visible = !!url && loaded && delayElapsed;

  // Start lightening shortly after the fade-in begins so the two transitions overlap.
  useEffect(() => {
    if (!visible) {
      setLit(false);
      return;
    }
    const t = setTimeout(() => setLit(true), 0);
    return () => clearTimeout(t);
  }, [visible]);

  if (!displayedUrl || !displayedSide) return null;

  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-0 overflow-hidden"
      style={{
        left: displayedSide === "left" ? 0 : "50%",
        right: displayedSide === "right" ? 0 : "50%",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.98)",
        transformOrigin: "center center",
        transition: `opacity ${KEYLOOK_TRANSITION_MS}ms ease-in-out, transform ${KEYLOOK_TRANSITION_MS}ms ${visible ? "ease-out" : "ease-in"}`,
      }}
    >
      <img
        key={displayedUrl}
        src={displayedUrl}
        alt=""
        decoding="async"
        onLoad={(e) => {
          const img = e.currentTarget;
          // Wait for decode so the fade only starts once pixels are ready to paint.
          if (img.decode) {
            img
              .decode()
              .then(() => setLoaded(true))
              .catch(() => setLoaded(true));
          } else {
            setLoaded(true);
          }
        }}
        className="h-full w-full object-cover"
        style={{
          filter: lit ? "brightness(1)" : "brightness(0)",
          transition: `filter ${KEYLOOK_TRANSITION_MS}ms ease-in-out`,
        }}
      />
    </div>
  );
}
