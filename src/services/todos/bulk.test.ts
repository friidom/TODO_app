import { describe, expect, it } from "vitest";

import type { IStatus, Todo } from "@/types/data";
import { planDelete, planFieldEdit, planStatusChange } from "./bulk";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    status_id: "todo",
    board_key: seq,
    title: `Item ${seq}`,
    type: "Task",
    priority: null,
    parent_id: null,
    start_date: null,
    due_date: null,
    sprint_id: null,
    backlog_rank: null,
    assignee_id: null,
    rank: 1024 * seq,
    position: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: null,
    ...over,
  } as Todo;
}

function status(id: string, column_id: string | null): IStatus {
  return { id, column_id, name: id, category: "todo" } as IStatus;
}

const todoS = status("todo", "c-todo");
const doing = status("doing", "c-doing");
const review = status("review", "c-doing");
const loose = status("loose", null);
const statusById = new Map([todoS, doing, review, loose].map((s) => [s.id, s]));

// todo → doing allowed, todo → review not; doing → review allowed
const allows = (from: string | null, to: string) =>
  !(from === "todo" && to === "review");

describe("planStatusChange", () => {
  it("moves what the workflow allows and skips what it refuses", () => {
    const a = todo();
    const b = todo({ status_id: "doing" });

    const plan = planStatusChange([a, b], review, [a, b], allows, statusById);

    expect(plan.moves.map((move) => move.todo.id)).toEqual([b.id]);
    expect(plan.skipped).toEqual([{ todo: a, reason: "transition" }]);
  });

  it("appends to the destination with a distinct rank for every card", () => {
    const resident = todo({ status_id: "doing", rank: 5000 });
    const a = todo();
    const b = todo();

    const plan = planStatusChange(
      [a, b],
      doing,
      [resident, a, b],
      allows,
      statusById,
    );
    const [first, second] = plan.moves.map((move) => move.rank);

    expect(first).toBeGreaterThan(5000);
    expect(second).toBeGreaterThan(first);
  });

  it("keeps a card's place when the status is in its own column", () => {
    const a = todo({ status_id: "doing", rank: 777 });

    expect(
      planStatusChange([a], review, [a], allows, statusById).moves[0].rank,
    ).toBe(777);
  });

  it("refuses a status on no column, and skips cards already in it", () => {
    const a = todo();
    const b = todo({ status_id: "doing" });

    expect(
      planStatusChange([a], loose, [a], allows, statusById).skipped,
    ).toEqual([{ todo: a, reason: "unplaceable" }]);
    expect(planStatusChange([b], doing, [b], allows, statusById).moves).toEqual(
      [],
    );
  });
});

describe("planFieldEdit", () => {
  const context = {
    activeSprintId: null,
    workflow: { statuses: [todoS, doing], statusById },
  };

  it("writes only the fields that were changed", () => {
    const a = todo();

    expect(
      planFieldEdit([a], { assignee_id: "u-1" }, [a], context).patches,
    ).toEqual([{ todo: a, patch: { assignee_id: "u-1" } }]);
    expect(planFieldEdit([a], {}, [a], context).patches).toEqual([]);
  });

  it("never writes a start after a due date, and says which rows it left", () => {
    const fine = todo({ due_date: "2026-10-30T00:00:00.000Z" });
    const early = todo({ due_date: "2026-10-03T00:00:00.000Z" });

    const plan = planFieldEdit(
      [fine, early],
      { start_date: "2026-10-05T00:00:00.000Z", priority: "high" },
      [fine, early],
      context,
    );

    expect(plan.patches).toEqual([
      {
        todo: fine,
        patch: { priority: "high", start_date: "2026-10-05T00:00:00.000Z" },
      },
      { todo: early, patch: { priority: "high" } },
    ]);
    expect(plan.skipped).toEqual([{ todo: early, reason: "dates" }]);
  });

  it("gives no parent to an Epic or a Subtask", () => {
    const epic = todo({ type: "Epic" });
    const task = todo();
    const sub = todo({ parent_id: task.id });
    const all = [epic, task, sub];

    const plan = planFieldEdit(
      [epic, task, sub],
      { parent_id: epic.id },
      all,
      context,
    );

    expect(plan.patches).toEqual([
      { todo: task, patch: { parent_id: epic.id } },
    ]);
    expect(plan.skipped.map((skip) => skip.todo.id)).toEqual([epic.id, sub.id]);
  });

  it("lets a Subtask ride with its parent's sprint", () => {
    const task = todo();
    const sub = todo({ parent_id: task.id });

    const plan = planFieldEdit(
      [task, sub],
      { sprint_id: "s-1" },
      [task, sub],
      context,
    );

    expect(plan.patches.map((patch) => patch.todo.id)).toEqual([task.id]);
    expect(plan.patches[0].patch.sprint_id).toBe("s-1");
    expect(plan.skipped).toEqual([{ todo: sub, reason: "notApplicable" }]);
  });

  it("adds a label to every row, a Subtask included", () => {
    const task = todo();
    const sub = todo({ parent_id: task.id });

    expect(
      planFieldEdit([task, sub], { label: "ux" }, [task, sub], context).labels,
    ).toEqual([task, sub]);
  });
});

describe("planDelete", () => {
  it("sends only the top-most selected rows and counts what cascades", () => {
    const epic = todo({ type: "Epic" });
    const task = todo({ parent_id: epic.id });
    const sub = todo({ parent_id: task.id });
    const other = todo();

    const plan = planDelete([epic, task, other], [epic, task, sub, other]);

    expect(plan.roots.map((root) => root.id)).toEqual([epic.id, other.id]);
    expect([...plan.removed].sort()).toEqual(
      [epic.id, task.id, sub.id, other.id].sort(),
    );
    expect(plan.cascaded).toBe(1);
  });
});
