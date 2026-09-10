// plain .ts, not a component — this is a shared string across Search/Filter/Group/Sort, and react-refresh can't fast-refresh a module mixing a component with other exports
export const HEADER_CONTROL =
  "border-hairline bg-surface text-ink-2 hover:text-ink hover:bg-elevated focus-visible:ring-brand flex h-9 items-center gap-1.5 rounded-control border px-2.5 text-[13px] transition-colors duration-150 outline-none active:bg-wash-strong focus-visible:ring-2 disabled:cursor-default disabled:opacity-70";

// restates the hover so an active control doesn't grey out and look switched off on hover
export const HEADER_CONTROL_ACTIVE =
  "border-brand/40 bg-brand-soft text-brand hover:bg-brand/20 hover:text-brand active:bg-brand/25";

// no border until hover/focus — search is used far more than the others, so it sits a level quieter
export const HEADER_CONTROL_QUIET =
  "text-ink-3 hover:text-ink-2 hover:bg-surface focus-within:bg-surface focus-within:border-hairline focus-within:ring-brand/40 flex h-9 items-center gap-1.5 rounded-control border border-transparent px-2.5 text-[13px] transition-colors duration-150 outline-none focus-within:ring-2";

export const HEADER_CONTROL_BADGE =
  "bg-brand text-brand-fg ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold";
