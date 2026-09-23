// UI-only mirror of backend/src/lib/workflow.ts — enforcement lives there, in
// todos.service.ts, and this copy exists so a control the API would refuse is
// not offered in the first place. Kept honest by workflow-matrix.json and the
// parity test beside this file, the same arrangement permissions.ts uses.
//
// A card's status is the category of the column it sits in, so a transition is
// a move between columns of different categories.

export const WORKFLOW_STAGES = [
  "todo",
  "in_progress",
  "in_review",
  "done",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export function isWorkflowStage(value: unknown): value is WorkflowStage {
  return (
    typeof value === "string" &&
    (WORKFLOW_STAGES as readonly string[]).includes(value)
  );
}

// null (not -1) for a category off the sequence, so callers must test it rather
// than let it flow into the arithmetic below.
export function stageIndexOf(
  category: string | null | undefined,
): number | null {
  return isWorkflowStage(category) ? WORKFLOW_STAGES.indexOf(category) : null;
}

// Forward exactly one step, backward any distance, sideways freely. Only
// SKIPPING is refused — reopening finished work is not what a workflow guards.
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

// The stages a refused move would have skipped, so a tooltip can name them.
export function stagesBetween(
  from: string | null | undefined,
  to: string | null | undefined,
): WorkflowStage[] {
  const start = stageIndexOf(from);
  const end = stageIndexOf(to);

  if (start === null || end === null || end - start <= 1) return [];

  return WORKFLOW_STAGES.slice(start + 1, end);
}
