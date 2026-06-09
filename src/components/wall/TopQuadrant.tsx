import { useEffect, useState } from "react";
import { useScaledUnits } from "@/hooks/useScaledUnits";
import type { Shoe } from "@/types/wall";
import {
  VIDEO_REVEAL_DELAY_MS,
  VIDEO_CLEAR_DELAY_MS,
  SHOE_HOLD_MS,
  NAME_FADE_MS,
} from "@/constants/animation";

/**
 * Top half of one side: a looping split video — or the static product photo as a
 * fallback when the shoe has no video — with the shoe name + tech tags anchored
 * below. Keeps rendering the last shoe briefly on removal so it can fade out.
 */
export function TopQuadrant({ shoe, videoUrl }: { shoe: Shoe | null; videoUrl: string | null }) {
  const { u, ut, px } = useScaledUnits();
  const [displayedVideoUrl, setDisplayedVideoUrl] = useState<string | null>(videoUrl);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoDelayElapsed, setVideoDelayElapsed] = useState(false);
  // Keep last shoe so name/tech stay rendered while fading out on removal.
  const [displayedShoe, setDisplayedShoe] = useState<Shoe | null>(shoe);

  useEffect(() => {
    if (videoUrl) {
      setDisplayedVideoUrl(videoUrl);
      setVideoLoaded(false);
      setVideoDelayElapsed(false);
      // Load the video immediately, but only reveal it after the delay.
      const t = setTimeout(() => setVideoDelayElapsed(true), VIDEO_REVEAL_DELAY_MS);
      return () => clearTimeout(t);
    }
    setVideoDelayElapsed(false);
    const t = setTimeout(() => {
      setDisplayedVideoUrl(null);
      setVideoLoaded(false);
    }, VIDEO_CLEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [videoUrl]);

  useEffect(() => {
    if (shoe) {
      setDisplayedShoe(shoe);
      return;
    }
    // Clear text only after the close animation has played out.
    const t = setTimeout(() => setDisplayedShoe(null), SHOE_HOLD_MS);
    return () => clearTimeout(t);
  }, [shoe]);

  const videoVisible = !!videoUrl && videoLoaded && videoDelayElapsed;

  const techText = displayedShoe?.technology
    ? displayedShoe.technology.split(/,\s*/).filter(Boolean).join("  |  ")
    : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {displayedVideoUrl ? (
        <video
          key={displayedVideoUrl}
          src={displayedVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setVideoLoaded(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
            videoVisible ? "opacity-100" : "opacity-0"
          }`}
          style={{ paddingTop: u(125), paddingBottom: u(240) }}
        />
      ) : null}

      {/* Fallback: static product photo when this shoe has no split video.
          Most catalog shoes have a gallery image but no demo video (yet). */}
      {!displayedVideoUrl && displayedShoe?.image_url ? (
        <img
          key={displayedShoe.image_url}
          src={displayedShoe.image_url}
          alt=""
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
            shoe?.image_url ? "opacity-100" : "opacity-0"
          }`}
          style={{ paddingTop: u(125), paddingBottom: u(240) }}
        />
      ) : null}

      {/* Name + tech: anchored to the bottom of the top quadrant.
          Position is fixed regardless of whether a video is loaded. */}
      <div
        className="absolute left-0 right-0 flex flex-col items-center text-center"
        style={{
          bottom: u(184),
          opacity: shoe ? 1 : 0,
          filter: shoe ? "blur(0px)" : `blur(${u(72)})`,
          transition: `opacity ${NAME_FADE_MS}ms ease-in-out, filter ${NAME_FADE_MS}ms ease-in-out`,
        }}
      >
        <div className="font-sans font-bold text-black" style={{ ...px(72), lineHeight: 1 }}>
          {displayedShoe?.commercial_name ?? "—"}
        </div>
        {techText ? (
          <div
            className="font-sans text-black/70"
            style={{ ...px(26), marginTop: ut(18), letterSpacing: ut(0.3) }}
          >
            {techText}
          </div>
        ) : null}
      </div>
    </div>
  );
}
