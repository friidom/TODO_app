import { describe, expect, it } from "vitest";

import {
  applyColumnEvent,
  applyCommentEvent,
  applyTodoEvent,
  type RowChange,
} from "./events";
import type { Comment, IColumn, Todo } from "@/types/data";

let seq = 0;

function todo(over: Partial<Todo> = {}): Todo {
  seq += 1;

  return {
    id: `t-${seq}`,
    board_id: "b-1",
    column_id: "c-1",
    position: seq,
    rank: seq * 1000,
    board_key: seq,
    title: `Item ${seq}`,
    type: "Task",
    priority: null,
    start_date: null,
    due_date: null,
    assignee_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: null,
    ...over,
  } as Todo;
}

function column(over: Partial<IColumn> = {}): IColumn {
  seq += 1;

  return {
    id: `c-${seq}`,
    board_id: "b-1",
    title: `Column ${seq}`,
    position: seq,
    rank: seq * 1000,
    category: "todo",
    min_limit: null,
    max_limit: null,
    ...over,
  } as IColumn;
}

function change<T>(
  eventType: RowChange<T>["eventType"],
  parts: { new?: Partial<T>; old?: Partial<T> },
): RowChange<T> {
  return {
    eventType,
    new: parts.new ?? ({} as Partial<T>),
    old: parts.old ?? ({} as Partial<T>),
  };
}

describe("applyTodoEvent — INSERT", () => {
  it("adds a row this client has never seen", () => {
    const board = [todo({ id: "a" })];
    const arrived = todo({ id: "b" });

    const result = applyTodoEvent(board, change("INSERT", { new: arrived }));

    expect(result.map((it) => it.id)).toContain("b");
    expect(result).toHaveLength(2);
  });

  it("IGNORES AN ECHO OF THIS CLIENT'S OWN INSERT", () => {
    const mine = todo({ id: "mine", title: "Local", position: 7 });
    const board = [mine];

    const echoed = { ...mine, title: "Local", position: 99 };

    const result = applyTodoEvent(board, change("INSERT", { new: echoed }));

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(mine);
  });

  it("is idempotent when the same remote insert is delivered twice", () => {
    const board = [todo({ id: "a" })];
    const arrived = todo({ id: "b" });
    const event = change("INSERT", { new: arrived });

    const once = applyTodoEvent(board, event);
    const twice = applyTodoEvent(once, event);

    expect(twice).toHaveLength(2);
  });

  it("ignores a payload with no row in it", () => {
    const board = [todo()];

    expect(applyTodoEvent(board, change("INSERT", {}))).toBe(board);
  });
});

describe("applyTodoEvent — UPDATE", () => {
  it("replaces the whole row, so a move is just an update", () => {
    const board = [todo({ id: "a", column_id: "c-1", rank: 100 })];

    const moved = todo({
      id: "a",
      column_id: "c-2",
      rank: 250,
      title: "Renamed on the way",
    });

    const result = applyTodoEvent(board, change("UPDATE", { new: moved }));

    expect(result[0].column_id).toBe("c-2");
    expect(result[0].rank).toBe(250);
    expect(result[0].title).toBe("Renamed on the way");
  });

  it("drops an update for a row it does not have, rather than inventing it", () => {
    const board = [todo({ id: "a" })];

    const result = applyTodoEvent(
      board,
      change("UPDATE", { new: todo({ id: "ghost" }) }),
    );

    expect(result).toBe(board);
  });
});

describe("applyTodoEvent — DELETE", () => {
  it("removes by the primary key, which is all a delete payload carries", () => {
    const board = [todo({ id: "a" }), todo({ id: "b" })];

    const result = applyTodoEvent(
      board,
      change("DELETE", { old: { id: "a" } }),
    );

    expect(result.map((it) => it.id)).toEqual(["b"]);
  });

  it("is a no-op for an id from another board", () => {
    const board = [todo({ id: "a" })];

    expect(
      applyTodoEvent(board, change("DELETE", { old: { id: "elsewhere" } })),
    ).toHaveLength(1);
  });

  it("ignores a delete with no id", () => {
    const board = [todo()];

    expect(applyTodoEvent(board, change("DELETE", {}))).toBe(board);
  });
});

describe("applyColumnEvent", () => {
  it("adds an unseen column and ignores the echo of a known one", () => {
    const existing = column({ id: "c-a" });
    const board = [existing];

    const added = applyColumnEvent(
      board,
      change("INSERT", { new: column({ id: "c-b" }) }),
    );

    expect(added).toHaveLength(2);
    expect(applyColumnEvent(added, change("INSERT", { new: existing }))).toBe(
      added,
    );
  });

  it("applies a rename as a whole-row merge", () => {
    const board = [column({ id: "c-a", title: "Todo" })];

    const result = applyColumnEvent(
      board,
      change("UPDATE", { new: { ...board[0], title: "Backlog" } }),
    );

    expect(result[0].title).toBe("Backlog");
  });

  it("removes a deleted column by id", () => {
    const board = [column({ id: "c-a" }), column({ id: "c-b" })];

    const result = applyColumnEvent(
      board,
      change("DELETE", { old: { id: "c-a" } }),
    );

    expect(result.map((it) => it.id)).toEqual(["c-b"]);
  });

  it("does not mutate the array it is given", () => {
    const board = [column({ id: "c-a" })];
    const before = [...board];

    applyColumnEvent(board, change("INSERT", { new: column({ id: "c-b" }) }));

    expect(board).toEqual(before);
  });
});

describe("applyTodoEvent — concurrency", () => {
  it("keeps a local optimistic card when a remote insert lands beside it", () => {
    const board = [todo({ id: "mine", column_id: "c-1", rank: 100 })];

    const result = applyTodoEvent(
      board,
      change("INSERT", { new: todo({ id: "theirs", column_id: "c-1" }) }),
    );

    expect(result.map((it) => it.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("gives one winner and no orphan when two clients move the same card", () => {
    const board = [todo({ id: "a", column_id: "c-1", rank: 100 })];

    const viaFirst = applyTodoEvent(
      board,
      change("UPDATE", { new: todo({ id: "a", column_id: "c-2", rank: 250 }) }),
    );

    const viaSecond = applyTodoEvent(
      viaFirst,
      change("UPDATE", { new: todo({ id: "a", column_id: "c-3", rank: 400 }) }),
    );

    expect(viaSecond.filter((it) => it.id === "a")).toHaveLength(1);
    expect(viaSecond.find((it) => it.id === "a")?.column_id).toBe("c-3");
    expect(viaSecond.some((it) => it.column_id === "c-2")).toBe(false);
  });

  it("keeps both cards when two clients drag different cards in one column", () => {
    const board = [
      todo({ id: "a", column_id: "c-1", rank: 100 }),
      todo({ id: "b", column_id: "c-1", rank: 200 }),
    ];

    const afterA = applyTodoEvent(
      board,
      change("UPDATE", { new: todo({ id: "a", column_id: "c-1", rank: 300 }) }),
    );

    const afterB = applyTodoEvent(
      afterA,
      change("UPDATE", { new: todo({ id: "b", column_id: "c-1", rank: 150 }) }),
    );

    expect(afterB.find((it) => it.id === "a")?.rank).toBe(300);
    expect(afterB.find((it) => it.id === "b")?.rank).toBe(150);
  });

  it("takes the last write whole, without inventing a merge", () => {
    const base = todo({ id: "a", title: "Original", priority: null });

    const afterFirst = applyTodoEvent(
      [base],
      change("UPDATE", { new: { ...base, title: "From A", priority: "high" } }),
    );

    const afterSecond = applyTodoEvent(
      afterFirst,
      change("UPDATE", { new: { ...base, title: "From B" } }),
    );

    expect(afterSecond[0].title).toBe("From B");
    expect(afterSecond[0].priority).toBeNull();
  });

  it("converges when an update overtakes its insert", () => {
    const board = [todo({ id: "a" })];
    const late = todo({ id: "late", title: "Edited" });

    const dropped = applyTodoEvent(board, change("UPDATE", { new: late }));

    expect(dropped).toBe(board);

    const arrived = applyTodoEvent(dropped, change("INSERT", { new: late }));

    expect(arrived.map((it) => it.id).sort()).toEqual(["a", "late"]);
  });

  it("does not resurrect a deleted row from a late update", () => {
    const board = [todo({ id: "a" }), todo({ id: "b" })];

    const deleted = applyTodoEvent(
      board,
      change("DELETE", { old: { id: "a" } }),
    );

    const stale = applyTodoEvent(
      deleted,
      change("UPDATE", { new: todo({ id: "a", title: "Ghost" }) }),
    );

    expect(stale.map((it) => it.id)).toEqual(["b"]);
  });

  it("does not mutate the array it is given", () => {
    const board = [todo({ id: "a", column_id: "c-1" })];
    const before = [...board];

    applyTodoEvent(
      board,
      change("INSERT", { new: todo({ column_id: "c-1" }) }),
    );
    applyTodoEvent(
      board,
      change("UPDATE", { new: { ...board[0], title: "x" } }),
    );
    applyTodoEvent(board, change("DELETE", { old: { id: "a" } }));

    expect(board).toEqual(before);
  });
});

let commentSeq = 0;

function comment(over: Partial<Comment> = {}): Comment {
  commentSeq += 1;

  return {
    id: `cm-${commentSeq}`,
    board_id: "b-1",
    todo_id: "t-1",
    author_id: "u-1",
    content: `comment ${commentSeq}`,
    created_at: `2026-08-18T09:${String(commentSeq).padStart(2, "0")}:00.000Z`,
    updated_at: `2026-08-18T09:${String(commentSeq).padStart(2, "0")}:00.000Z`,
    ...over,
  } as Comment;
}

describe("applyCommentEvent", () => {
  it("adds a comment from another client", () => {
    const thread = [comment({ id: "a" })];

    const result = applyCommentEvent(
      thread,
      change("INSERT", { new: comment({ id: "b" }) }),
    );

    expect(result.map((it) => it.id)).toEqual(["a", "b"]);
  });

  it("IGNORES AN ECHO OF THIS CLIENT'S OWN COMMENT", () => {
    const mine = comment({ id: "mine", content: "posted locally" });
    const thread = [mine];

    const result = applyCommentEvent(
      thread,
      change("INSERT", { new: { ...mine } }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(mine);
    expect(result).toBe(thread);
  });

  it("is idempotent when the same remote insert is delivered twice", () => {
    const thread = [comment({ id: "a" })];
    const event = change("INSERT", { new: comment({ id: "b" }) });

    const once = applyCommentEvent(thread, event);
    const twice = applyCommentEvent(once, event);

    expect(twice).toHaveLength(2);
  });

  it("puts an out-of-order arrival in posting order", () => {
    const thread = [
      comment({ id: "a", created_at: "2026-08-18T09:00:00.000Z" }),
      comment({ id: "c", created_at: "2026-08-18T09:02:00.000Z" }),
    ];

    const result = applyCommentEvent(
      thread,
      change("INSERT", {
        new: comment({ id: "b", created_at: "2026-08-18T09:01:00.000Z" }),
      }),
    );

    expect(result.map((it) => it.id)).toEqual(["a", "b", "c"]);
  });

  it("applies a remote edit as a whole-row replacement", () => {
    const thread = [comment({ id: "a", content: "before" })];

    const result = applyCommentEvent(
      thread,
      change("UPDATE", {
        new: comment({
          id: "a",
          content: "after",
          updated_at: "2026-08-18T10:00:00.000Z",
        }),
      }),
    );

    expect(result[0].content).toBe("after");
    expect(result[0].updated_at).toBe("2026-08-18T10:00:00.000Z");
  });

  it("drops an edit for a comment it does not have, rather than inventing it", () => {
    const thread = [comment({ id: "a" })];

    expect(
      applyCommentEvent(
        thread,
        change("UPDATE", { new: comment({ id: "x" }) }),
      ),
    ).toBe(thread);
  });

  it("removes a deleted comment by the primary key, which is all it carries", () => {
    const thread = [comment({ id: "a" }), comment({ id: "b" })];

    const result = applyCommentEvent(
      thread,
      change("DELETE", { old: { id: "a" } }),
    );

    expect(result.map((it) => it.id)).toEqual(["b"]);
  });

  it("is a no-op for a delete whose comment is in another thread", () => {
    const thread = [comment({ id: "a" })];

    expect(
      applyCommentEvent(thread, change("DELETE", { old: { id: "elsewhere" } })),
    ).toHaveLength(1);
  });

  it("ignores payloads with nothing to act on", () => {
    const thread = [comment({ id: "a" })];

    expect(applyCommentEvent(thread, change("INSERT", {}))).toBe(thread);
    expect(applyCommentEvent(thread, change("DELETE", {}))).toBe(thread);
  });

  it("does not mutate the thread it is given", () => {
    const thread = [comment({ id: "a" })];
    const before = [...thread];

    applyCommentEvent(thread, change("INSERT", { new: comment({ id: "b" }) }));
    applyCommentEvent(thread, change("DELETE", { old: { id: "a" } }));

    expect(thread).toEqual(before);
  });
});
