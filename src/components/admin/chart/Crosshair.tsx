import { xOf } from "@/services/admin/flow";

export default function Crosshair({
  index,
  count,
  height,
}: {
  index: number;
  count: number;
  height: number;
}) {
  const x = xOf(index, count);

  return (
    <line
      x1={x}
      x2={x}
      y1="0"
      y2={height}
      stroke="currentColor"
      strokeWidth="1"
      strokeDasharray="2 2"
      vectorEffect="non-scaling-stroke"
      className="text-ink/30"
    />
  );
}
