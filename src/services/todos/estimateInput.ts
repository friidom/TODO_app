/**
 * `EstimateControl`'s own logic, pulled out of the component (M24-B).
 *
 * This project does not unit-test components directly — no React Testing
 * Library, deliberately, because pure logic is where the risk lives. The risk
 * here is exactly the one `todos_estimate_check` and M24-A's `TodoPatch`
 * widening exist to guard: a negative value reaching the database, and an
 * empty input silently becoming a stored `0` instead of "no estimate". Both
 * are decided here, where a test can pin them, rather than inside a
 * `useState` in a component nothing renders in this test file.
 */

/** The trigger's label when the control is not being edited. */
export function formatEstimate(value: number | null): string {
  return value === null ? "–" : String(value);
}

/**
 * Whether the trigger stays on screen without a hover or a focus to reveal
 * it — the same rule `AssigneeControl` and `DueDateControl` apply to their
 * own unset state, so an estimate-less board stays as free of chrome as an
 * assignee-less or date-less one.
 *
 * Named and exported rather than left as an inline `value === null` in the
 * component: it is the one condition `EstimateControl`'s hover/focus/coarse
 * class trio all branch on, and a test can pin the rule here even though it
 * cannot render the classes themselves.
 *
 * `forced` is the caller's own override (M31-C): a surface with no row to
 * hover — the Task Details rail, where the field's label reserves the space
 * and an empty cell would read as broken — asks for the trigger regardless.
 * It is a second argument here rather than an `|| alwaysVisible` in the
 * component for the same reason this function exists at all: the rule stays
 * in one place a test can reach, instead of half here and half in the JSX.
 */
export function estimateAlwaysVisible(
  value: number | null,
  forced = false,
): boolean {
  return forced || value !== null;
}

/** What the input shows the moment editing starts, or what cancel reverts to. */
export function estimateToDraft(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * A typed draft, resolved to the value `save` should send — or `undefined`
 * if the draft cannot be saved at all.
 *
 * **Empty resolves to `null`, and it is not run through `Number()` to get
 * there.** `Number("")` is `0` in JavaScript, which is exactly the
 * null-vs-zero collapse M24-A's constraint and cache widening exist to keep
 * out of the row — an emptied input is "clear the estimate", not "estimate
 * this at zero points". Whitespace is trimmed first so a draft of `"  "`
 * reads as empty rather than as a parse failure.
 *
 * A negative number, or anything that does not parse to a finite number at
 * all (`"abc"`, `"1.2.3"`, a bare `"-"`), is `undefined` — invalid, and the
 * caller keeps editing rather than saving it. `Number()` rather than
 * `parseFloat()`: the latter accepts a trailing non-numeric tail (`"3abc"`
 * parses to `3`), which would silently save a value the user did not type.
 */
export function parseEstimateDraft(draft: string): number | null | undefined {
  const trimmed = draft.trim();

  if (trimmed === "") return null;

  const value = Number(trimmed);

  if (!Number.isFinite(value) || value < 0) return undefined;

  return value;
}
