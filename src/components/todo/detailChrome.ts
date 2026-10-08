// Plain .ts, like dialogChrome.ts: react-refresh can't fast-refresh a module that mixes components with other exports.

export const SECTION_TITLE = "text-ink text-sm font-semibold";

export const COUNT_CHIP =
  "bg-wash-strong text-ink-2 text-micro grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 font-semibold tabular-nums";

export const TABLE = "border-hairline rounded-card overflow-hidden border";

export const TABLE_HEAD =
  "border-hairline text-ink-3 text-micro h-8 border-b font-medium tracking-wide uppercase";

export const TABLE_ROW =
  "border-hairline hover:bg-wash border-b transition-colors duration-150 last:border-b-0";

const INLINE_ACTION_BASE =
  "rounded-control shrink-0 px-1.5 py-0.5 font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-45";

export const INLINE_ACTION = `${INLINE_ACTION_BASE} text-ink-3 hover:bg-wash-strong hover:text-ink focus-visible:ring-brand`;

export const INLINE_ACTION_BRAND = `${INLINE_ACTION_BASE} text-brand hover:bg-brand-soft focus-visible:ring-brand`;

export const INLINE_ACTION_DANGER = `${INLINE_ACTION_BASE} text-status-red hover:bg-status-red/10 focus-visible:ring-status-red`;

export const TEXT_FIELD =
  "border-hairline bg-surface text-ink placeholder:text-ink-3 focus:border-brand focus:ring-brand border outline-none transition-colors duration-150 focus:ring-1";

export const SEGMENTED =
  "border-hairline rounded-control flex items-center gap-0.5 border p-0.5";

export const SEGMENT =
  "focus-visible:ring-brand h-6 rounded-[6px] px-2 text-mini font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2";

export const SEGMENT_ACTIVE = "bg-brand-soft text-brand";

export const SEGMENT_IDLE = "text-ink-2 hover:bg-wash-strong hover:text-ink";
