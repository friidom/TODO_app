// Shared dialog class strings — a plain .ts (not .tsx) so react-refresh can fast-refresh modules that import this.
// Each dialog still owns its own escape/backdrop handling; only the surface classes are shared.

export const DIALOG_TITLE = "text-ink text-base font-semibold tracking-tight";

export const DIALOG_BODY = "text-ink-2 text-meta leading-relaxed";

export const DIALOG_LABEL = "text-ink-2 mb-1.5 block text-meta font-medium";

export const DIALOG_ACTIONS = "mt-6 flex items-center justify-end gap-2";

const ACTION_BASE =
  "rounded-control focus-visible:ring-offset-surface inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const DIALOG_CANCEL = `${ACTION_BASE} text-ink-2 hover:bg-ink/[0.06] active:bg-ink/[0.1] hover:text-ink focus-visible:ring-brand`;

export const DIALOG_CONFIRM = `${ACTION_BASE} bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-brand`;

// filled red, not a ghost button — a destructive action needs to be unmistakable, not just tinted differently
export const DIALOG_DANGER = `${ACTION_BASE} bg-status-red text-white hover:bg-status-red/90 active:bg-status-red/80 focus-visible:ring-status-red`;

export const DIALOG_ERROR =
  "border-status-red/30 bg-status-red/10 text-status-red rounded-control mt-4 border px-3 py-2 text-xs";
