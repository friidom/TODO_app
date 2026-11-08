export const FLYOUT_ROW =
  "hover:bg-brand-wash focus-visible:bg-brand-wash focus-visible:ring-brand rounded-control flex w-full min-w-0 items-center gap-2.5 px-2 py-1.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2";

export const FLYOUT_LINK =
  "text-ink-3 hover:text-brand focus-visible:text-brand focus-visible:ring-brand rounded-control text-mini font-medium underline-offset-2 transition-colors duration-150 outline-none hover:underline focus-visible:ring-2";

export const flyoutRowProps = { "data-flyout-row": "" } as const;

export const FLYOUT_ROW_SELECTOR = "[data-flyout-row]";
