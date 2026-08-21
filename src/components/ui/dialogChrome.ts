/**
 * The shells every dialog wears (M22).
 *
 * A plain `.ts` of strings, for the reason `fieldInput.ts` and
 * `headerControl.ts` are: react-refresh cannot fast-refresh a module that mixes
 * a component with other exports, and these are classes several dialogs share.
 *
 * **This exists because the audit found seven dialog implementations and four
 * button vocabularies.** `SpaceFormModal` still wore `border-app`,
 * `hover:bg-muted`, `rounded-xl` and `text-2xl font-bold` — tokens and scales
 * from before the design system — beside a board dialog using the current ones,
 * so two dialogs a click apart looked like two products. The overlay plumbing
 * is deliberately **not** unified here: each dialog keeps its own working
 * escape and backdrop handling, and only the surface it presents is shared.
 *
 * The heading is `text-base font-semibold`, not `text-2xl font-bold`. A dialog
 * is 420px wide and already has the user's whole attention — a 24px bold
 * heading in that space is shouting, and it is louder than the page titles it
 * opens over, which inverts the hierarchy.
 */

/** The dialog's own title. One scale for every dialog in the product. */
export const DIALOG_TITLE = "text-ink text-base font-semibold tracking-tight";

/** Supporting text under the title: what this will do, or what it will cost. */
export const DIALOG_BODY = "text-ink-2 text-[13px] leading-relaxed";

/** The row the actions sit in. */
export const DIALOG_ACTIONS = "mt-6 flex items-center justify-end gap-2";

/** Shared geometry, so the three action shells cannot drift apart. */
const ACTION_BASE =
  "rounded-control focus-visible:ring-offset-surface inline-flex h-9 items-center justify-center gap-1.5 px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

/** Walk away. Quiet — it must not compete with the thing you came to do. */
export const DIALOG_CANCEL = `${ACTION_BASE} text-ink-2 hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-brand`;

/** Commit. The only filled button in the dialog. */
export const DIALOG_CONFIRM = `${ACTION_BASE} bg-brand text-brand-fg hover:bg-brand/90 focus-visible:ring-brand`;

/**
 * Commit something destructive.
 *
 * **Filled red, not a red-texted ghost.** A destructive action has to be
 * unmistakable at a glance and impossible to confuse with Cancel beside it —
 * the previous mix (one dialog filled, another tinted, a third red text) meant
 * the visual weight of "delete" depended on which dialog you happened to be in.
 */
export const DIALOG_DANGER = `${ACTION_BASE} bg-status-red text-white hover:bg-status-red/90 focus-visible:ring-status-red`;

/** An error the dialog itself has to report, above its actions. */
export const DIALOG_ERROR =
  "border-status-red/30 bg-status-red/10 text-status-red rounded-control mt-4 border px-3 py-2 text-xs";
