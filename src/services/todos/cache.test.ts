import { describe, expect, it } from "vitest";

import type { Todo } from "../../types/data";
import { RANK_GAP, byRank } from "../../utils/rank";
import {
  applySubtaskInserted,
  applyTodoConfirmed,
  applyTodoDeleted,
  applyTodoInserted,
  applyTodoMoved,
  applyTodoUpdated,
} from "./cache";

// Ids are uuids in the schema (M2-14). These take a number and stringify it,
// so the fixtures and the expectations below stay readable — what is under
// test is identity and ordering, and neither cares about the format.
const todo = (id: number, column_id: string, position: number): Todo =>
  ({
    id: String(id),
    column_id,
    position,
    // Derived from the position exactly as `20260814121000_backfill_ranks.sql`
    // derives it, so a fixture built by index is the board the backfill would
    // have produced.
    rank: (position + 1) * RANK_GAP,
    title: `todo ${id}`,
  }) as Todo;

/** Ids of a column, in stored order, back as numbers. */
const column = (todos: Todo[], columnId: string) =>
  todos
    .filter((it) => it.column_id === columnId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((it) => Number(it.id));

/** Positions of a column, in stored order. */
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
  // Since M2-14 the client mints the id, so the pending row and the server's
  // answer are the same row — id 7 in both. What still differs is the
  // position: the user dropped the card at slot 1, the server appended it.
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

    // Deleted mid-flight: nothing matched, so nothing changed — and the caller
    // reading the position back off the result gets the server's, which is
    // what tells `useAddTodo` there is no reorder to write.
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
    // `priority` rather than `description`: M5-07 narrowed the board's rows to
    // the twelve columns the UI reads, and `description` is no longer one of
    // them — the field this asserts about has to be a field the cache holds.
    const todos = [{ ...todo(1, "a", 0), priority: "high" }];
    const result = applyTodoUpdated(todos, todo(1, "a", 0));

    // Undefined, not null: the `todo()` helper builds a partial row, so the
    // replacement simply has no `priority` key — which is the point. A merge
    // would have carried "high" across.
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

    // Deliberate: useDeleteTodo invalidates in onSettled, so the server's
    // numbering arrives moments later. Renumbering here would be a second
    // answer that has to agree with it.
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
  /** Ids of a column in display order — by rank, which is what M6-A orders by. */
  const ranked = (todos: Todo[], columnId: string) =>
    todos
      .filter((it) => it.column_id === columnId)
      .sort(byRank)
      .map((it) => Number(it.id));

  it("writes the column and the rank onto exactly one row", () => {
    // The heart of M6-04. A move used to renumber both affected columns and
    // write every card in them; now the card carries its own place, so one
    // field on one row is the entire change.
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
    // The property the whole milestone exists for. The cards left behind are
    // not rewritten, so a second editor's concurrent drag cannot be reverted
    // by this one — under dense positions every one of them was written from a
    // possibly-stale snapshot, and last write won.
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
    // This is what makes rollback possible: onMutate snapshots the cached
    // array, and the cache holds these very objects. Writing in place would
    // corrupt the snapshot, leaving onError nothing to restore.
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

      // Everything else is shared by reference, so React re-renders exactly
      // the card that moved.
      const others = result.filter((row) => row.id !== "1");

      for (const row of others) {
        expect(todos.some((original) => original === row)).toBe(true);
      }
    });
  });
});

/**
 * M27. Subtasks live in the same `["todos", boardId]` array as cards — that is
 * what lets the parent panel and the card indicator read them without a second
 * query — so the cache functions have to hold up with both kinds in one array.
 */
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
    // The whole reason this is not `applyTodoInserted`: that one buckets by
    // `column_id` and hands the bucket to `insertDense`, which rewrites the
    // position of every card in it. A subtask shares a column with cards —
    // that is what gives it a status — but occupies no slot among them.
    const todos = board();
    const before = positions(todos, "a");

    const result = applySubtaskInserted(todos, subtask(99, "1"));

    // Cards only. The subtask's own position stays null, which is the other
    // half of the same point: it was never given a slot to hold.
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
    // The client mints the uuid, so a realtime insert caused by this client
    // arrives carrying the id already in the array.
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
    // The database cascades (`todos_parent_id_fkey`), but this function
    // removes exactly one id — it cannot know what the server also deleted.
    // `useDeleteTodo`'s `onSettled` invalidate is what repairs the array, and
    // this test pins that the optimistic frame genuinely needs it rather than
    // leaving a future reader to assume the cascade is mirrored here.
    const todos = [...board(), subtask(98, "1")];

    const result = applyTodoDeleted(todos, "1");

    expect(result.map((row) => row.id)).not.toContain("1");
    expect(result.map((row) => row.id)).toContain("98");
  });
});
