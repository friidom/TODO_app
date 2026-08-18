import { describe, expect, it } from "vitest";

import { applyColumnEvent, applyTodoEvent, type RowChange } from "./events";
import type { IColumn, Todo } from "@/types/data";

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

/** A payload in the shape Supabase delivers one. */
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
    // The whole of M6-10, and the reason it is one line: the client mints the
    // uuid (M2-14), so its own event carries the id already in the cache. A
    // second copy of the card is what this prevents.
    const mine = todo({ id: "mine", title: "Local", position: 7 });
    const board = [mine];

    const echoed = { ...mine, title: "Local", position: 99 };

    const result = applyTodoEvent(board, change("INSERT", { new: echoed }));

    expect(result).toHaveLength(1);
    // Untouched, not replaced: the optimistic row holds the slot the user
    // dropped it in, and the mutation's own onSuccess reconciles it.
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
    // The rank the SENDER chose, carried through rather than recomputed —
    // recomputing would put the card somewhere different on every receiver.
    expect(result[0].rank).toBe(250);
    expect(result[0].title).toBe("Renamed on the way");
  });

  it("drops an update for a row it does not have, rather than inventing it", () => {
    // A missed INSERT. Convergence is the re-subscribe resync's job, not this
    // function's — inserting from an UPDATE would be a second mechanism.
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
    // REPLICA IDENTITY DEFAULT: `old` is the id and nothing else. See the
    // M6-07 migration for why it is not widened.
    const board = [todo({ id: "a" }), todo({ id: "b" })];

    const result = applyTodoEvent(
      board,
      change("DELETE", { old: { id: "a" } }),
    );

    expect(result.map((it) => it.id)).toEqual(["b"]);
  });

  it("is a no-op for an id from another board", () => {
    // The DELETE subscription is unfiltered, so ids from boards this client is
    // not looking at do arrive. They must cost nothing.
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
    // Same contract every cache function here follows: the cached array is the
    // rollback snapshot for any mutation in flight.
    const board = [column({ id: "c-a" })];
    const before = [...board];

    applyColumnEvent(board, change("INSERT", { new: column({ id: "c-b" }) }));

    expect(board).toEqual(before);
  });
});

/**
 * M6-12 · concurrency.
 *
 * The Testing Checklist's concurrency section, as far as it can be pinned
 * without a socket: every row below is two clients' events arriving at one
 * cache in a particular order, which is exactly what these pure functions take.
 * What stays manual is the transport — that two browsers *deliver* these
 * payloads — and it is recorded as such in `docs/REALTIME_VERIFICATION.md`.
 */
describe("applyTodoEvent — M6-12 concurrency", () => {
  it("keeps a local optimistic card when a remote insert lands beside it", () => {
    // The client's own row is already in the cache under its minted uuid; a
    // stranger's insert into the same column must not cost it.
    const board = [todo({ id: "mine", column_id: "c-1", rank: 100 })];

    const result = applyTodoEvent(
      board,
      change("INSERT", { new: todo({ id: "theirs", column_id: "c-1" }) }),
    );

    expect(result.map((it) => it.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("gives one winner and no orphan when two clients move the same card", () => {
    // Both moves are whole-row UPDATEs for one id. Last write wins, and the
    // card cannot end up in two columns because the row is replaced, not added.
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
    // This is what M6-A's single-row rank writes buy. Under the old dense
    // renumbering each sender wrote the whole column from its own snapshot, so
    // the second event silently reverted the first sender's card.
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
    // Field-level last-write-wins is what the payload gives us: the row is
    // replaced by the sender's copy, so a field the second sender did not set
    // reverts rather than surviving from the first. Merging would be a rule
    // neither client agreed to.
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
    // Out-of-order delivery: the update for a row we do not have is dropped
    // rather than invented, and the insert that follows still lands.
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
    // The cached array is the rollback snapshot of any mutation in flight, so
    // an event arriving mid-drag must not renumber the rows onError restores.
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
