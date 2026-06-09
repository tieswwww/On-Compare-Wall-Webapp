import onLogo from "@/assets/on-logo.png";

/**
 * The On logo, top-right. Mounted behind the quadrants and only shows through
 * when nothing is scanned (the quadrant panels cover it once a shoe is placed).
 */
export function IdleBackground() {
  return (
    <img
      src={onLogo}
      alt=""
      className="pointer-events-none absolute z-0"
      style={{ top: "3vh", right: "3vh", width: "6.3vh", mixBlendMode: "multiply" }}
    />
  );
}
