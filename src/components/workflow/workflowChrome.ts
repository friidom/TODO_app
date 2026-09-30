import type { RefObject } from "react";

import i18n from "@/components/i18n";

export const LANE_WIDTH = "w-60";

export const GRIP =
  "text-ink-3 hover:text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control grid h-7 w-5 shrink-0 cursor-grab touch-none place-items-center outline-none focus-visible:ring-2 active:cursor-grabbing [&_svg]:size-3.5";

export const ADD_BUTTON =
  "text-ink-3 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand rounded-control text-meta flex h-8 w-full items-center gap-1.5 px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 [&_svg]:size-4";

export const SELECT =
  "border-hairline bg-canvas text-ink focus:border-brand/50 focus:ring-brand/30 rounded-control text-meta h-8 w-full min-w-0 border px-2 outline-none focus:ring-2";

export const MOD_KEY =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl+";

export function workItems(count: number): string {
  return i18n.t("workflow.workItems", { count });
}

// Where focus goes once an inline editor closes: back to the control that
// opened it, unless the editor closed because focus already moved elsewhere.
export function refocus(target: RefObject<HTMLElement | null>) {
  requestAnimationFrame(() => {
    if (!document.activeElement || document.activeElement === document.body) {
      target.current?.focus();
    }
  });
}
