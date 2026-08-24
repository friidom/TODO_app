import { HEADER_CONTROL_ACTIVE } from "@/components/board/headerControl";
import {
  FOR_YOU_TABS,
  FOR_YOU_TAB_LABELS,
  type ForYouTab,
} from "@/services/forYou/feed";
import { cn } from "@/utils/cn";

/**
 * The five filters, as one segmented control (M21).
 *
 * **The same shell the timeline's scale toggle wears** — one bordered box,
 * hairline-separated, `HEADER_CONTROL_ACTIVE` on the selected segment — because
 * it is the same kind of control: a small, fixed set of mutually exclusive
 * views over one thing. Building a second look for it is how a product ends up
 * with four tab styles.
 *
 * **It scrolls sideways rather than wrapping on a narrow screen.** Five labels
 * do not fit on a phone, and the two alternatives are worse: wrapping puts the
 * control on two lines and pushes the feed down, and a dropdown hides four of
 * the five options behind a tap. A horizontal scroller keeps the row one line
 * tall and keeps every option one gesture away. `-mx-*` plus matching padding
 * lets it bleed to the screen edge, so the last tab is not clipped mid-word by
 * the page gutter.
 */
export default function ForYouTabs({
  value,
  counts,
  onChange,
}: {
  value: ForYouTab;
  /** Badge numbers, per tab. Absent or zero renders no badge. */
  counts?: Partial<Record<ForYouTab, number>>;
  onChange: (tab: ForYouTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter your work"
      className="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="border-hairline bg-surface rounded-control inline-flex h-9 items-center gap-0.5 border p-0.5">
        {FOR_YOU_TABS.map((tab) => {
          const selected = value === tab;
          const count = counts?.[tab] ?? 0;

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs leading-8 whitespace-nowrap transition-colors duration-150 outline-none",
                "focus-visible:ring-brand focus-visible:ring-2",
                selected
                  ? HEADER_CONTROL_ACTIVE
                  : "text-ink-3 hover:text-ink hover:bg-ink/[0.06]",
              )}
            >
              {FOR_YOU_TAB_LABELS[tab]}

              {count > 0 && (
                <span
                  className={cn(
                    "rounded px-1 text-micro leading-4 font-semibold tabular-nums",
                    selected
                      ? "bg-brand text-brand-fg"
                      : "bg-ink/[0.08] text-ink-3",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
