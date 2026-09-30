import type { ColumnCategory } from "@/constants/columns";

import { entryStatusOf, type WorkflowDraft } from "./draft";

export type DraftChange =
  | { kind: "status-added"; name: string; transitions: number }
  | {
      kind: "status-deleted";
      name: string;
      workItems: number;
      movedTo: string | null;
    }
  | { kind: "status-renamed"; from: string; to: string }
  | {
      kind: "status-category";
      name: string;
      from: ColumnCategory;
      to: ColumnCategory;
    }
  | { kind: "status-visibility"; name: string; hidden: boolean }
  | {
      kind: "status-column";
      name: string;
      from: string | null;
      to: string | null;
    }
  | { kind: "transition-added"; from: string; to: string }
  | { kind: "transition-removed"; from: string; to: string };

// What publishing `draft` over `base` would do, in words a reviewer can check.
// Transitions that come and go with a status are folded into that status's
// line rather than listed one by one: deleting a status says so once, not once
// per edge it took with it.
export function draftChanges(
  base: WorkflowDraft,
  draft: WorkflowDraft,
  counts: ReadonlyMap<string, number>,
): DraftChange[] {
  const before = new Map(base.statuses.map((status) => [status.id, status]));
  const after = new Map(draft.statuses.map((status) => [status.id, status]));
  const nameOf = (id: string) =>
    after.get(id)?.name ?? before.get(id)?.name ?? "";
  const columnTitle = (drafts: WorkflowDraft, id: string | null) =>
    id === null
      ? null
      : (drafts.columns.find((it) => it.id === id)?.title ?? null);

  const added = new Set([...after.keys()].filter((id) => !before.has(id)));
  const deleted = new Set([...before.keys()].filter((id) => !after.has(id)));
  const changes: DraftChange[] = [];

  const edgesBefore = new Set(base.transitions.map((e) => `${e.from}>${e.to}`));
  const edgesAfter = new Set(draft.transitions.map((e) => `${e.from}>${e.to}`));

  for (const id of added) {
    changes.push({
      kind: "status-added",
      name: nameOf(id),
      transitions: draft.transitions.filter(
        (edge) => edge.from === id || edge.to === id,
      ).length,
    });
  }

  for (const id of deleted) {
    const migration = draft.migrations.find((it) => it.from === id);

    changes.push({
      kind: "status-deleted",
      name: nameOf(id),
      workItems: counts.get(id) ?? 0,
      movedTo: migration ? nameOf(migration.to) : null,
    });
  }

  for (const [id, now] of after) {
    const was = before.get(id);

    if (!was) continue;

    if (was.name !== now.name) {
      changes.push({ kind: "status-renamed", from: was.name, to: now.name });
    }

    if (was.category !== now.category) {
      changes.push({
        kind: "status-category",
        name: now.name,
        from: was.category,
        to: now.category,
      });
    }

    if (was.is_hidden !== now.is_hidden) {
      changes.push({
        kind: "status-visibility",
        name: now.name,
        hidden: now.is_hidden,
      });
    }

    if (was.column_id !== now.column_id) {
      changes.push({
        kind: "status-column",
        name: now.name,
        from: columnTitle(base, was.column_id),
        to: columnTitle(draft, now.column_id),
      });
    }
  }

  const touches = (edge: { from: string; to: string }, ids: Set<string>) =>
    ids.has(edge.from) || ids.has(edge.to);

  for (const edge of draft.transitions) {
    if (edgesBefore.has(`${edge.from}>${edge.to}`) || touches(edge, added)) {
      continue;
    }

    changes.push({
      kind: "transition-added",
      from: nameOf(edge.from),
      to: nameOf(edge.to),
    });
  }

  for (const edge of base.transitions) {
    if (edgesAfter.has(`${edge.from}>${edge.to}`) || touches(edge, deleted)) {
      continue;
    }

    changes.push({
      kind: "transition-removed",
      from: nameOf(edge.from),
      to: nameOf(edge.to),
    });
  }

  return changes;
}

export type WorkflowWarning =
  | { kind: "no-way-out"; statusId: string }
  | { kind: "no-way-in"; statusId: string };

// Shapes the API accepts but that strand work, so the editor points them out
// rather than refusing them:
// - work in a status that is not done and has no transition out can never move;
// - a status nothing leads to can only be reached by creating work in it, which
//   the board offers for a column's first visible status and no other.
// Unmapped statuses take no work at all, so neither applies to them.
export function workflowWarnings(draft: WorkflowDraft): WorkflowWarning[] {
  const warnings: WorkflowWarning[] = [];

  for (const status of draft.statuses) {
    if (status.column_id === null) continue;

    const out = draft.transitions.some((edge) => edge.from === status.id);
    const into = draft.transitions.some((edge) => edge.to === status.id);

    if (!out && status.category !== "done") {
      warnings.push({ kind: "no-way-out", statusId: status.id });
    }

    if (
      !into &&
      !status.is_hidden &&
      entryStatusOf(draft, status.column_id)?.id !== status.id
    ) {
      warnings.push({ kind: "no-way-in", statusId: status.id });
    }
  }

  return warnings;
}
