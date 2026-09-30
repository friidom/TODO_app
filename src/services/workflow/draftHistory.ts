import type { WorkflowDraft } from "./draft";

const LIMIT = 100;

export interface DraftHistory {
  past: WorkflowDraft[];
  present: WorkflowDraft;
  future: WorkflowDraft[];
}

export function startHistory(draft: WorkflowDraft): DraftHistory {
  return { past: [], present: draft, future: [] };
}

export function pushed(
  history: DraftHistory,
  next: WorkflowDraft,
): DraftHistory {
  if (next === history.present) return history;

  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: next,
    future: [],
  };
}

export function undone(history: DraftHistory): DraftHistory {
  const previous = history.past.at(-1);

  if (!previous) return history;

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redone(history: DraftHistory): DraftHistory {
  const [next, ...rest] = history.future;

  if (!next) return history;

  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}
