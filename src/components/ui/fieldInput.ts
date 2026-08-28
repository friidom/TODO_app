/**
 * The form-field shell, shared by every page that asks for typed input.
 *
 * A plain `.ts` module rather than a component, for the reason `headerControl.ts`
 * is one: react-refresh cannot fast-refresh a module that mixes a component with
 * other exports, and this is a string that several forms wear.
 *
 * It exists because the alternative was three input styles in one product — the
 * profile page had its own, the auth forms had `rounded border p-3` left over
 * from before the tokens, and `ui/input.tsx` is a vendored shadcn primitive at a
 * different height that nothing in the redesigned surfaces uses. One string
 * means a field looks the same wherever it is asked for.
 *
 * `bg-canvas` on purpose: every form here sits on a `bg-surface` card, so the
 * input reads as a well cut into the card rather than a panel floating on it.
 */
export const FIELD_INPUT =
  "border-hairline bg-canvas text-ink placeholder:text-ink-3 focus:border-brand/50 focus:ring-brand/30 rounded-control w-full border px-3 py-2 text-sm transition-colors outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

/** The same field, when what it holds has been rejected. */
export const FIELD_INPUT_INVALID =
  "border-status-red/50 focus:border-status-red/60 focus:ring-status-red/25";

/**
 * The full-width button that commits a form it is the only action on.
 *
 * `h-10` rather than the `h-9` of a toolbar control, and full width because on
 * an auth card there is nothing to sit beside. The profile page keeps its own
 * inline `h-9` save button — that one shares a row with an error message.
 */
export const FORM_SUBMIT =
  "bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-brand focus-visible:ring-offset-surface rounded-control flex h-10 w-full items-center justify-center gap-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
