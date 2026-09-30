import { describe, expect, it } from "vitest";

import type { WorkflowDraft } from "./draft";
import { pushed, redone, startHistory, undone } from "./draftHistory";

const draft = (version: number): WorkflowDraft => ({
  version,
  columns: [],
  statuses: [],
  transitions: [],
  migrations: [],
});

describe("draft history", () => {
  const a = draft(1);
  const b = draft(2);
  const c = draft(3);

  it("undoes and redoes edits in order", () => {
    const history = pushed(pushed(startHistory(a), b), c);

    expect(undone(history).present).toBe(b);
    expect(undone(undone(history)).present).toBe(a);
    expect(redone(undone(undone(history))).present).toBe(b);
  });

  it("drops the redo stack once a new edit is made", () => {
    const history = pushed(undone(pushed(startHistory(a), b)), c);

    expect(history.future).toEqual([]);
    expect(redone(history)).toBe(history);
  });

  it("does nothing past either end", () => {
    const history = startHistory(a);

    expect(undone(history)).toBe(history);
    expect(redone(history)).toBe(history);
  });

  it("ignores an edit that changed nothing", () => {
    const history = startHistory(a);

    expect(pushed(history, a)).toBe(history);
  });

  it("forgets the oldest edits past its limit", () => {
    let history = startHistory(draft(0));

    for (let i = 1; i <= 150; i++) history = pushed(history, draft(i));

    expect(history.past).toHaveLength(100);
    expect(history.past[0]!.version).toBe(50);
  });
});
