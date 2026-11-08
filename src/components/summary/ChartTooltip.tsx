import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

// Above the plot at the hovered point's x (0–100 across the plot). Near an edge it pins to that edge instead of
// centring, so it never hangs outside a card at phone width. role=status reads the keyboard cursor's point aloud.
export function ChartTooltip({
  x,
  title,
  children,
}: {
  x: number;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      style={x > 78 ? { right: `${100 - x}%` } : { left: `${Math.max(x, 0)}%` }}
      className={cn(
        "border-brand/25 bg-elevated text-ink shadow-e2 rounded-control pointer-events-none absolute bottom-full z-10 mb-2 min-w-36 border px-2.5 py-2 text-xs whitespace-nowrap",
        x >= 22 && x <= 78 && "-translate-x-1/2",
      )}
    >
      <p className="text-ink mb-1 font-semibold tabular-nums">{title}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function TooltipRow({
  dot,
  label,
  value,
}: {
  dot?: string;
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <p className="flex items-center gap-2">
      {dot && <span className={cn("size-2 shrink-0 rounded-full", dot)} />}
      <span className="text-ink-2">{label}</span>
      <span className="text-ink ml-auto pl-3 font-semibold tabular-nums">
        {value}
      </span>
    </p>
  );
}
