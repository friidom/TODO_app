import { describe, expect, it } from "vitest";

import type { Todo } from "../../types/data";
import { RANK_GAP, byRank } from "../../utils/rank";
import {
  applyBacklogMoved,
  applySubtaskInserted,
  applyTodoConfirmed,
  applyTodoDeleted,
  applyTodoInserted,
  applyTodoMoved,
  applyTodoUpdated,
} from "./cache";

// ids are uuids in the schema — these just stringify a number for readable fixtures
const todo = (id: number, column_id: string, position: number): Todo =>
  ({
    id: String(id),
    column_id,
    position,
    rank: (position + 1) * RANK_GAP,
    title: `todo ${id}`,
  }) as Todo;

const column = (todos: Todo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => Number(it.id));

const positions = (todos: Todo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .map((it) => it.position)
    .sort((a, b) => (a ?? 0) - (b ?? 0));

const board = () => [
  todo(1, "a", 0),
  todo(2, "a", 1),
  todo(3, "a", 2),
  todo(4, "b", 0),
  todo(5, "b", 1),
  todo(6, "c", 0),
];

describe("applyTodoInserted", () => {
  const fresh = () => todo(99, "a", 0);

  it("splices into the column at the index and renumbers it", () => {
    const todos = board();
    const result = applyTodoInserted(todos, fresh(), 1);

    expect(column(result, "a")).toEqual([1, 99, 2, 3]);
    expect(positions(result, "a")).toEqual([0, 1, 2, 3]);
  });

  it("appends when no index is given", () => {
    const todos = board();
    const result = applyTodoInserted(todos, fresh());

    expect(column(result, "a")).toEqual([1, 2, 3, 99]);
    expect(positions(result, "a")).toEqual([0, 1, 2, 3]);
  });

  it("carries the other columns through untouched", () => {
    const todos = board();
    const result = applyTodoInserted(todos, fresh(), 0);

    expect(column(result, "b")).toEqual([4, 5]);
    expect(column(result, "c")).toEqual([6]);
    expect(result.length).toBe(todos.length + 1);
  });

  it("opens an empty column", () => {
    const todos = board().filter((it) => it.column_id !== "c");
    const result = applyTodoInserted(todos, { ...todo(99, "c", 0) }, 0);

    expect(column(result, "c")).toEqual([99]);
    expect(positions(result, "c")).toEqual([0]);
  });

  it("never mutates the input", () => {
    const todos = board();
    const before = todos.map((it) => ({ ...it }));

    applyTodoInserted(todos, fresh(), 1);

    expect(todos).toEqual(before);
  });
});

describe("applyTodoConfirmed", () => {
  // client mints the id, so pending and server rows share it — only the position differs
  const pendingRow = { ...todo(7, "a", 1), title: "typed by the user" };
  const server = todo(7, "a", 3);

  const pending = () => [todo(1, "a", 0), { ...pendingRow }, todo(2, "a", 2)];

  it("merges the server row onto the card without changing its identity", () => {
    const result = applyTodoConfirmed(pending(), server);

    expect(column(result, "a")).toEqual([1, 7, 2]);
    expect(result.length).toBe(3);
    expect(result.find((it) => it.id === "7")?.title).toBe("todo 7");
  });

  it("keeps the slot the user picked over the position the server assigned", () => {
    const result = applyTodoConfirmed(pending(), server);

    expect(result.find((it) => it.id === "7")?.position).toBe(1);
    expect(server.position).toBe(3);
  });

  it("falls back to the server position when the row is gone", () => {
    const result = applyTodoConfirmed(board(), server);

    // deleted mid-flight, nothing matched — falling back to the server position tells useAddTodo there's no reorder to write
    expect(result).toEqual(board());
    expect(result.find((it) => it.id === "7")).toBeUndefined();
  });
});

describe("applyTodoUpdated", () => {
  it("replaces the row that shares the id", () => {
    const todos = board();
    const result = applyTodoUpdated(todos, {
      ...todo(2, "a", 1),
      title: "renamed",
    });

    expect(result.find((it) => it.id === "2")?.title).toBe("renamed");
    expect(result.length).toBe(todos.length);
    expect(column(result, "a")).toEqual([1, 2, 3]);
  });

  it("replaces rather than merges, so a stale field does not survive", () => {
    const todos = [{ ...todo(1, "a", 0), priority: "high" }];
    const result = applyTodoUpdated(todos, todo(1, "a", 0));

    // a merge would have carried "high" across
    expect(result[0].priority).toBeUndefined();
  });

  it("leaves the board alone when nothing matches", () => {
    const todos = board();

    expect(applyTodoUpdated(todos, todo(404, "a", 0))).toEqual(todos);
  });

  it("never mutates the input", () => {
    const todos = board();
    const before = todos.map((it) => ({ ...it }));

    applyTodoUpdated(todos, { ...todo(2, "a", 1), title: "renamed" });

    expect(todos).toEqual(before);
  });
});

describe("applyTodoDeleted", () => {
  it("removes the row", () => {
    const todos = board();
    const result = applyTodoDeleted(todos, "2");

    expect(result.length).toBe(todos.length - 1);
    expect(result.some((it) => it.id === "2")).toBe(false);
  });

  it("leaves the gap in the surviving positions", () => {
    const result = applyTodoDeleted(board(), "2");

    // deliberate — useDeleteTodo's onSettled invalidate fixes the numbering moments later
    expect(column(result, "a")).toEqual([1, 3]);
    expect(positions(result, "a")).toEqual([0, 2]);
  });

  it("leaves the board alone when nothing matches", () => {
    const todos = board();

    expect(applyTodoDeleted(todos, "404")).toEqual(todos);
  });

  it("never mutates the input", () => {
    const todos = board();
    const before = todos.map((it) => ({ ...it }));

    applyTodoDeleted(todos, "2");

    expect(todos).toEqual(before);
  });
});

describe("applyTodoMoved", () => {
  const ranked = (todos: Todo[], columnId: string) =>
    todos
      .filter((it) => it.column_id === columnId)
      .sort(byRank)
      .map((it) => Number(it.id));

  it("writes the column and the rank onto exactly one row", () => {
    const todos = board();
    const result = applyTodoMoved(todos, todos[0], "b", 1536);

    const moved = result.find((it) => it.id === "1");

    expect(moved?.column_id).toBe("b");
    expect(moved?.rank).toBe(1536);
  });

  it("puts the card where the rank says, within one column", () => {
    const todos = board();
    // Between 2 (2048) and 3 (3072).
    const result = applyTodoMoved(todos, todos[0], "a", 2560);

    expect(ranked(result, "a")).toEqual([2, 1, 3]);
  });

  it("carries the card into another column at the rank given", () => {
    const todos = board();
    // Column b holds 4 (rank 1024) and 5 (rank 2048); land between them.
    const result = applyTodoMoved(todos, todos[0], "b", 1536);

    expect(ranked(result, "b")).toEqual([4, 1, 5]);
    expect(ranked(result, "a")).toEqual([2, 3]);
  });

  it("handles an empty destination column", () => {
    const todos = board().filter((it) => it.column_id !== "c");
    const result = applyTodoMoved(todos, todos[0], "c", RANK_GAP);

    expect(ranked(result, "c")).toEqual([1]);
    expect(ranked(result, "a")).toEqual([2, 3]);
  });

  it("LEAVES THE SOURCE COLUMN'S RANKS ALONE", () => {
    // cards left behind aren't rewritten, so a concurrent drag by someone else can't be reverted by this one
    const todos = board();
    const result = applyTodoMoved(todos, todos[0], "b", 1536);

    for (const id of ["2", "3"]) {
      const before = todos.find((it) => it.id === id);
      const after = result.find((it) => it.id === id);

      expect(after).toBe(before);
    }
  });

  it("loses and duplicates nothing", () => {
    const todos = board();
    const result = applyTodoMoved(todos, todos[3], "a", 512);

    expect(result.length).toBe(todos.length);
    expect(new Set(result.map((it) => it.id)).size).toBe(todos.length);
  });

  describe("immutability", () => {
    // this is what makes rollback possible — onMutate snapshots the array, writing in place would corrupt it
    it("never mutates the input", () => {
      const todos = board();
      const before = todos.map((it) => ({ ...it }));

      applyTodoMoved(todos, todos[0], "b", 1536);

      expect(todos).toEqual(before);
    });

    it("returns a fresh object for the moved row only", () => {
      const todos = board();
      const result = applyTodoMoved(todos, todos[0], "b", 1536);

      const moved = result.find((row) => row.id === "1");

      expect(todos.some((original) => original === moved)).toBe(false);

      // everything else shared by reference, so React re-renders only the card that moved
      const others = result.filter((row) => row.id !== "1");

      for (const row of others) {
        expect(todos.some((original) => original === row)).toBe(true);
      }
    });
  });
});

describe("applyBacklogMoved", () => {
  it("writes only the fields the patch names, onto exactly one row", () => {
    const todos = board();
    const result = applyBacklogMoved(todos, "1", { backlog_rank: 1536 });

    const moved = result.find((it) => it.id === "1");

    expect(moved?.backlog_rank).toBe(1536);
    expect(moved?.sprint_id).toBe(todos[0].sprint_id);
    expect(moved?.column_id).toBe(todos[0].column_id);
  });

  it("carries a cross-Sprint move's full patch — sprint_id, column_id and rank together", () => {
    const todos = board();
    const result = applyBacklogMoved(todos, "1", {
      sprint_id: "sprint-a",
      backlog_rank: 1536,
      column_id: "a",
      rank: 512,
    });

    const moved = result.find((it) => it.id === "1");

    expect(moved).toMatchObject({
      sprint_id: "sprint-a",
      backlog_rank: 1536,
      column_id: "a",
      rank: 512,
    });
  });

  it("passes every other row through by reference", () => {
    const todos = board();
    const result = applyBacklogMoved(todos, "1", { backlog_rank: 1536 });

    for (const id of ["2", "3", "4", "5", "6"]) {
      const before = todos.find((it) => it.id === id);
      const after = result.find((it) => it.id === id);

      expect(after).toBe(before);
    }
  });

  it("never mutates the input", () => {
    const todos = board();
    const before = todos.map((it) => ({ ...it }));

    applyBacklogMoved(todos, "1", { backlog_rank: 1536 });

    expect(todos).toEqual(before);
  });
});

// subtasks live in the same ["todos", boardId] array as cards, so these functions need to hold up with both kinds mixed in
describe("applySubtaskInserted", () => {
  const subtask = (id: number, parent: string): Todo =>
    ({
      id: String(id),
      parent_id: parent,
      column_id: "a",
      title: `subtask ${id}`,
      position: null,
      rank: null,
    }) as unknown as Todo;

  it("appends the subtask without touching the cards", () => {
    const todos = board();
    const result = applySubtaskInserted(todos, subtask(99, "1"));

    expect(result).toHaveLength(todos.length + 1);
    expect(result.at(-1)?.id).toBe("99");
  });

  it("does NOT renumber the cards in the column the subtask sits in", () => {
    // a subtask shares a column with cards (that's what gives it a status) but occupies no slot among them
    const todos = board();
    const before = positions(todos, "a");

    const result = applySubtaskInserted(todos, subtask(99, "1"));

    const cards = result.filter((row) => row.parent_id == null);

    expect(positions(cards, "a")).toEqual(before);
    expect(result.find((row) => row.id === "99")?.position).toBeNull();
  });

  it("passes every existing row through by reference", () => {
    const todos = board();
    const result = applySubtaskInserted(todos, subtask(99, "1"));

    for (const original of todos) {
      expect(result).toContain(original);
    }
  });

  it("ignores an id it already holds — the echo rule", () => {
    // client mints the uuid, so a realtime insert this client caused arrives with an id already in the array
    const mine = subtask(99, "1");
    const todos = applySubtaskInserted(board(), mine);

    const result = applySubtaskInserted(todos, { ...mine, title: "echo" });

    expect(result).toBe(todos);
    expect(result.filter((row) => row.id === "99")).toHaveLength(1);
  });

  it("does not mutate its input", () => {
    const todos = board();
    const length = todos.length;

    applySubtaskInserted(todos, subtask(99, "1"));

    expect(todos).toHaveLength(length);
  });
});

describe("applyTodoDeleted — with subtasks in the array", () => {
  const subtask = (id: number, parent: string): Todo =>
    ({
      id: String(id),
      parent_id: parent,
      column_id: "a",
      title: `subtask ${id}`,
      position: null,
      rank: null,
    }) as unknown as Todo;

  it("removes one subtask and leaves its siblings", () => {
    const todos = [
      ...board(),
      subtask(97, "1"),
      subtask(98, "1"),
      subtask(99, "2"),
    ];

    const result = applyTodoDeleted(todos, "97");

    expect(result.map((row) => row.id)).not.toContain("97");
    expect(result.map((row) => row.id)).toContain("98");
    expect(result.map((row) => row.id)).toContain("99");
  });

  it("leaves a deleted parent's children behind, which is why the delete refetches", () => {
    // the db cascades the delete, but this function only removes the one id it's told — useDeleteTodo's onSettled invalidate repairs the rest
    const todos = [...board(), subtask(98, "1")];

    const result = applyTodoDeleted(todos, "1");

    expect(result.map((row) => row.id)).not.toContain("1");
    expect(result.map((row) => row.id)).toContain("98");
  });
});
