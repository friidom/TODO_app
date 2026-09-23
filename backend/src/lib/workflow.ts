// The sequential workflow, and the authority for it. Beside permissions.ts and
// for the same reason: a rule read off a table rather than reconstructed from
// ifs spread over the services that enforce it.
//
// A card's status is not a column on todos — it is the category of the column
// the card sits in (columns_category_check, 0019: 'todo' | 'in_progress' |
// 'in_review' | 'done'). So a "status transition" is a move between columns of
// different categories, and these are the names the schema already uses.
//
// in_review is a stage rather than a second in_progress column because that is
// the only way "In Progress -> Done is refused" can be expressed at all — 0019's
// header has the whole story.

export const WORKFLOW_STAGES = ["todo", "in_progress", "in_review", "done"] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return (
    typeof value === "string" && (WORKFLOW_STAGES as readonly string[]).includes(value)
  );
}

// null (not -1) for a category outside the sequence, so callers must test it
// rather than let it flow into the arithmetic below. columns.category is
// nullable, and a stage that cannot be placed cannot be sequenced.
export function stageIndexOf(category: string | null | undefined): number | null {
  return isWorkflowStage(category) ? WORKFLOW_STAGES.indexOf(category) : null;
}

// Forward exactly one step, backward any distance, sideways freely. Only
// SKIPPING is refused — reopening finished work is not what a workflow is for,
// and refusing it would break the ordinary board.
//
// With these four stages that refuses exactly todo -> in_review, todo -> done
// and in_progress -> done, and it stays correct if the sequence grows again.
export function canTransition(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const start = stageIndexOf(from);
  const end = stageIndexOf(to);

  // An uncategorised column is not on the sequence, so there is no step to
  // measure and nothing to refuse.
  if (start === null || end === null) return true;

  return end - start <= 1;
}

// The stages a refused move would have skipped, so the error can name them
// instead of only saying no. Empty whenever canTransition already allows it.
export function stagesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): WorkflowStage[] {
  const start = stageIndexOf(from);
  const end = stageIndexOf(to);

  if (start === null || end === null || end - start <= 1) return [];

  return WORKFLOW_STAGES.slice(start + 1, end);
}
