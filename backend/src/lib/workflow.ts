// The sequential workflow, and the authority for it. Beside permissions.ts and
// for the same reason: a rule read off a table rather than reconstructed from
// ifs spread over the services that enforce it.
//
// The stages are status CATEGORIES (statuses_category_check, 0024: 'todo' |
// 'in_progress' | 'in_review' | 'done'), not statuses. A board may have any
// number of statuses in each category, so a "transition" is a move between two
// statuses whose categories differ; two statuses of one category are the same
// stage, and moving between them is sideways.
//
// in_review is a stage rather than a second in_progress category because that
// is the only way "In Progress -> Done is refused" can be expressed at all —
// 0019's header has the whole story.

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

// The edges a fresh board starts with, and what migration 0030 backfilled: the
// category rule above applied to a concrete set of statuses. A stage the board
// has no visible status in cannot be stopped at, so a move may skip it.
export function defaultTransitions(
  statuses: readonly { id: string; category: string; is_hidden?: boolean }[],
): { from: string; to: string }[] {
  const present = new Set(
    statuses.filter((status) => !status.is_hidden).map((status) => stageIndexOf(status.category)),
  );
  const edges: { from: string; to: string }[] = [];

  for (const a of statuses) {
    for (const b of statuses) {
      const start = stageIndexOf(a.category);
      const end = stageIndexOf(b.category);

      if (a.id === b.id || start === null || end === null) continue;

      const skipsStop = [...present].some((idx) => idx !== null && idx > start && idx < end);

      if (end - start <= 1 || !skipsStop) edges.push({ from: a.id, to: b.id });
    }
  }

  return edges;
}
