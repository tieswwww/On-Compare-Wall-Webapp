import { useEffect, useState } from "react";
import { useScaledUnits } from "@/hooks/useScaledUnits";
import { hexForSalesColor } from "@/lib/sales-colors";
import type { Shoe } from "@/types/wall";
import {
  SHOE_HOLD_MS,
  BOTTOM_STAGE_MS,
  BOTTOM_STAGGER_MS,
  COLOR_DRAPE_FADE_MS,
} from "@/constants/animation";
import { BarGraph } from "@/components/wall/BarGraph";
import { DataItem } from "@/components/wall/DataItem";

/**
 * Bottom half of one side: a two-stage reveal.
 *   Stage 1: the sales-colour drape drops down from the top.
 *   Stage 2: a black panel drops over it, revealing the stats.
 * On close the order reverses (black retracts first, then the colour). Keeps the
 * last shoe's colour + stats rendered while closing so it animates out cleanly.
 */
export function BottomQuadrant({ shoe, open }: { shoe: Shoe | null; open: boolean }) {
  const { u, ut, px } = useScaledUnits();
  const liveHex = hexForSalesColor(shoe?.sales_color_name);
  // Remember the color used while the panel was open, so the closing
  // animation keeps the color of the shoe that was just removed.
  const [colorHex, setColorHex] = useState<string>(liveHex);
  // Same idea for the shoe content — keep rendering the last shoe's stats
  // while the panel closes, then clear once it's offscreen.
  const [displayedShoe, setDisplayedShoe] = useState<Shoe | null>(shoe);
  useEffect(() => {
    if (shoe?.sales_color_name) setColorHex(liveHex);
  }, [shoe?.sales_color_name, liveHex]);
  useEffect(() => {
    if (shoe) {
      setDisplayedShoe(shoe);
      return;
    }
    const t = setTimeout(() => setDisplayedShoe(null), SHOE_HOLD_MS);
    return () => clearTimeout(t);
  }, [shoe]);
  const s = displayedShoe;
  const colorDelay = open ? 0 : BOTTOM_STAGGER_MS; // close: black leaves first, color follows shortly
  const blackDelay = open ? BOTTOM_STAGGER_MS : 0; // open:  color drops first, black follows shortly

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Stage 1: color drape */}
      <div
        className="absolute inset-0"
        style={{
          background: colorHex,
          opacity: 0.8,

          clipPath: open ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
          transition: `clip-path ${BOTTOM_STAGE_MS}ms cubic-bezier(0.7, 0, 0.2, 1) ${colorDelay}ms, background-color ${COLOR_DRAPE_FADE_MS}ms ease`,
        }}
      />
      {/* Stage 2: black panel with content */}
      <div
        className="absolute inset-0 bg-black text-[#EBEEF0]"
        style={{
          clipPath: open ? "inset(0 0 0 0)" : "inset(0 0 100% 0)",
          transition: `clip-path ${BOTTOM_STAGE_MS}ms cubic-bezier(0.7, 0, 0.2, 1) ${blackDelay}ms`,
        }}
      >
        {/* Top-aligned, horizontally centered column. Items inside stay left-aligned. */}
        <div className="flex h-full w-full flex-col items-center" style={{ paddingTop: u(119) }}>
          <div className="flex flex-col items-start" style={{ width: "fit-content" }}>
            {/* Energy header */}
            <div
              className="font-sans font-bold text-[#EBEEF0]"
              style={{ ...px(66), lineHeight: 1, marginBottom: u(40) }}
            >
              {s?.experience ?? "Energy"}
            </div>

            {/* Bar graph stats */}
            <div style={{ marginBottom: u(62) }}>
              <div style={{ marginBottom: u(24) }}>
                <div
                  className="font-mono uppercase text-[#EBEEF0]/55"
                  style={{ ...px(29), letterSpacing: ut(1.5), marginBottom: ut(18) }}
                >
                  Cushioning
                </div>
                <BarGraph value={s?.cushioning_scale} />
              </div>
              <div style={{ marginBottom: u(24) }}>
                <div
                  className="font-mono uppercase text-[#EBEEF0]/55"
                  style={{ ...px(29), letterSpacing: ut(1.5), marginBottom: ut(18) }}
                >
                  Responsiveness
                </div>
                <BarGraph value={s?.responsiveness_scale} />
              </div>
              <div>
                <div
                  className="font-mono uppercase text-[#EBEEF0]/55"
                  style={{ ...px(29), letterSpacing: ut(1.5), marginBottom: ut(18) }}
                >
                  Stability
                </div>
                <BarGraph value={s?.stability_scale} />
              </div>
            </div>

            {/* Data items */}
            <DataItem label="Activity" value={s?.activity_type} />
            <DataItem label="Best For" value={s?.activity_best_for} />
            <DataItem label="Ride Type/Feel" value={s?.ride_type} />
            <DataItem label="Recommended Distance" value={s?.recommended_distance} />
          </div>
        </div>
      </div>
    </div>
  );
}
