import type { ReactNode } from "react";
import { SquareKanbanIcon } from "lucide-react";

/**
 * The frame both auth pages sit in.
 *
 * One component rather than two identical page wrappers, because that is
 * precisely the pair that drifts: they were `bg-violet-600` holding a white
 * card — the last two screens still wearing colours from before the token
 * system, and the first thing anyone sees of the product.
 *
 * The wordmark sits **outside** the card. Sign-in is the one screen with no
 * navigation, so the product has to name itself somewhere, and putting it above
 * the card keeps the card about the one thing it is asking for.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** The cross-link to the other auth page. */
  footer: ReactNode;
}) {
  return (
    <div className="bg-canvas relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-5 py-10">
      {/* A single soft wash behind the card, at a tenth — the same restraint the
          board's column headers use. It gives a very dark page somewhere to
          look without becoming the glow the rest of the product avoids. */}
      <div
        aria-hidden
        className="from-brand/10 pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b to-transparent"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="bg-brand text-brand-fg rounded-control grid size-8 place-items-center shadow-sm">
            <SquareKanbanIcon className="size-[18px]" />
          </span>
          <span className="text-ink font-wordmark text-xl font-semibold tracking-tight">
            Veylo
          </span>
        </div>

        <div className="border-hairline bg-surface rounded-surface w-full border p-7 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.5)]">
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
