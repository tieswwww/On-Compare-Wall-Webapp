import { useScaledUnits } from "@/hooks/useScaledUnits";

/** A 1–5 segmented bar (cushioning / responsiveness / stability). */
export function BarGraph({ value }: { value: number | null | undefined }) {
  const { u } = useScaledUnits();
  const v = Math.max(0, Math.min(5, value ?? 0));
  return (
    <div className="flex" style={{ gap: u(14) }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="bg-[#EBEEF0]"
          style={{ width: u(84), height: u(6), opacity: i <= v ? 1 : 0.18 }}
        />
      ))}
    </div>
  );
}
