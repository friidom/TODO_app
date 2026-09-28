// Plain .ts, like dialogChrome.ts: react-refresh can't fast-refresh a module that mixes components with other exports.
// No z-index in any recipe — each floating layer keeps its own place on the ladder (attachment menus sit at z-[70]).

const ICON_BUTTON_BASE =
  "text-ink-3 hover:text-ink hover:bg-wash-strong active:bg-wash-strong aria-expanded:bg-wash-strong aria-expanded:text-ink focus-visible:ring-brand inline-grid shrink-0 place-items-center rounded-control transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4";

export const ICON_BUTTON = {
  xs: `${ICON_BUTTON_BASE} size-6 coarse:size-8 [&_svg:not([class*='size-'])]:size-3.5`,
  sm: `${ICON_BUTTON_BASE} size-7 coarse:size-8`,
  md: `${ICON_BUTTON_BASE} size-8 coarse:size-9`,
  toolbar: `${ICON_BUTTON_BASE} border-hairline bg-surface hover:bg-elevated size-9 border`,
} as const;

export type IconButtonSize = keyof typeof ICON_BUTTON;

export const ICON_BUTTON_ACTIVE =
  "bg-brand-soft text-brand hover:bg-brand/20 hover:text-brand border-brand/40";

export const POPOVER_PANEL =
  "border-hairline bg-elevated text-ink rounded-card border p-1 shadow-e2";

const MENU_ITEM_BASE =
  "rounded-control flex w-full cursor-default items-center gap-2 px-2 py-1.5 text-left text-meta outline-none transition-colors select-none coarse:py-2.5 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const MENU_ITEM = `${MENU_ITEM_BASE} text-ink hover:bg-wash-strong focus-visible:bg-wash-strong [&_svg]:text-ink-3`;

export const MENU_ITEM_DANGER = `${MENU_ITEM_BASE} text-status-red hover:bg-status-red/10 focus-visible:bg-status-red/10`;

export const MENU_LABEL = "text-ink-3 px-2 pt-1.5 pb-1 text-mini font-medium";

export const MENU_SEPARATOR = "bg-hairline -mx-1 my-1 h-px";

export const TOOLBAR_DIVIDER = "bg-hairline mx-0.5 h-5 w-px shrink-0";
