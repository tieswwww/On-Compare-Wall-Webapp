import { useScaledUnits } from "@/hooks/useScaledUnits";

/** Split a value into display lines on commas, newlines, or `<br>`. */
function splitLines(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/<br\s*\/?>|\r?\n|,\s*/gi)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** A labelled stat block (Activity, Best For, …); renders nothing when empty. */
export function DataItem({ label, value }: { label: string; value: string | null | undefined }) {
  const { u, ut, px } = useScaledUnits();
  const lines = splitLines(value);
  if (lines.length === 0) return null;
  return (
    <div style={{ marginBottom: u(21) }}>
      <div
        className="font-mono uppercase text-[#EBEEF0]/55"
        style={{ ...px(18), letterSpacing: ut(1.5), marginBottom: ut(9) }}
      >
        {label}
      </div>
      {lines.map((line, i) => (
        <div
          key={i}
          className="font-sans font-bold text-[#EBEEF0]"
          style={{ ...px(33), lineHeight: 1.5 }}
        >
          {line}
        </div>
      ))}
    </div>
  );
}
