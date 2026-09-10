import type { ReactNode } from "react";
import { SquareKanbanIcon } from "lucide-react";

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="bg-canvas relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      <div
        aria-hidden
        className="from-brand/10 pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b to-transparent"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="bg-brand text-brand-fg rounded-control grid size-8 place-items-center shadow-e1">
            <SquareKanbanIcon className="size-[18px]" />
          </span>
          <span className="text-ink font-wordmark text-xl font-semibold tracking-tight">
            Veylo
          </span>
        </div>

        <div className="border-hairline bg-surface rounded-surface w-full border p-7 shadow-e3">
          <h1 className="text-ink text-xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="text-ink-3 mt-1 mb-6 text-sm">{subtitle}</p>

          {children}
        </div>

        <p className="text-ink-3 mt-5 text-sm">{footer}</p>
      </div>
    </div>
  );
}
