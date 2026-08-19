import { describe, expect, it } from "vitest";

import { sameViewers, viewersFrom, type PresenceState } from "./presence";

const AT = "2026-08-18T09:00:00Z";

/** Presence state as realtime-js hands it over: keyed, each key a meta list. */
function state(entries: Record<string, string[]>): PresenceState {
  return Object.fromEntries(
    Object.entries(entries).map(([key, ids]) => [
      key,
      ids.map((user_id) => ({ user_id, at: AT })),
    ]),
  );
}

describe("viewersFrom", () => {
  it("INCLUDES THE CURRENT USER — alone on the board, you are the roster", () => {
    // The regression this file exists for. The first version filtered the
    // viewer out, so one person saw an empty stack and two people saw one
    // avatar each: both clients correct, both looking broken.
    expect(viewersFrom(state({ "user-a": ["user-a"] }))).toEqual(["user-a"]);
  });

  it("lists everyone connected, not just the others", () => {
    const board = state({ "user-a": ["user-a"], "user-b": ["user-b"] });

    // The same answer on every client, which is what makes it checkable: A and
    // B are looking at one list, not at two complementary halves of one.
    expect(viewersFrom(board)).toEqual(["user-a", "user-b"]);
  });

  it("grows as people arrive", () => {
    expect(viewersFrom(state({ a: ["a"], b: ["b"], c: ["c"] }))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("drops someone the moment their key leaves the state", () => {
    // A leave is a state without that key — presence has no tombstones, and
    // this function has no memory, so departure is simply absence.
    const before = state({ a: ["a"], b: ["b"], c: ["c"] });
    const after = state({ a: ["a"], c: ["c"] });

    expect(viewersFrom(before)).toContain("b");
    expect(viewersFrom(after)).toEqual(["a", "c"]);
  });

  it("counts one person with two tabs once", () => {
    // The channel keys presence by user id, so both tabs land under one key —
    // but a key can hold several connections and neither should double them.
    expect(viewersFrom(state({ "user-b": ["user-b", "user-b"] }))).toEqual([
      "user-b",
    ]);
  });

  it("dedupes the same person appearing under two keys", () => {
    // Belt and braces: if a client ever tracked without the id key, the same
    // person must still be one avatar.
    expect(viewersFrom(state({ k1: ["dup"], k2: ["dup"] }))).toEqual(["dup"]);
  });

  it("is ordered stably, so avatars do not swap places on reconnect", () => {
    const one = viewersFrom(state({ z: ["z"], a: ["a"], m: ["m"] }));
    const other = viewersFrom(state({ m: ["m"], z: ["z"], a: ["a"] }));

    expect(one).toEqual(["a", "m", "z"]);
    expect(other).toEqual(one);
  });

  it("gives nobody special treatment — there is no self to sort first", () => {
    // The function takes no viewer id at all now, which is what guarantees
    // every client reduces the same state to the same list.
    expect(viewersFrom.length).toBe(1);
  });

  it("survives an empty state and a malformed entry", () => {
    expect(viewersFrom({})).toEqual([]);
    expect(viewersFrom({ broken: [undefined as never] })).toEqual([]);
    expect(viewersFrom({ empty: [] })).toEqual([]);
  });
});

describe("sameViewers", () => {
  it("holds the render guard: an identical roster under a new reference", () => {
    // The exact shape the sync handler sees. `viewersFrom` allocates a fresh
    // array every time, so this is what an unchanged board looks like — and
    // the case that has to return true or the whole board repaints.
    const a = viewersFrom(state({ u1: ["u1"], u2: ["u2"] }));
    const b = viewersFrom(state({ u1: ["u1"], u2: ["u2"] }));

    expect(a).not.toBe(b);
    expect(sameViewers(a, b)).toBe(true);
  });

  it("sees an arrival", () => {
    expect(sameViewers(["u1"], ["u1", "u2"])).toBe(false);
  });

  it("sees a departure", () => {
    expect(sameViewers(["u1", "u2"], ["u1"])).toBe(false);
  });

  it("sees a swap that keeps the count", () => {
    // Same length, different people — the case a length check alone would miss.
    expect(sameViewers(["u1", "u2"], ["u1", "u3"])).toBe(false);
  });

  it("treats two empty rosters as equal", () => {
    expect(sameViewers([], [])).toBe(true);
  });

  it("compares element-wise, which viewersFrom's sort is what licenses", () => {
    // Not a claim that order is ignored — it is a claim that it never differs.
    // Both sides go through viewersFrom, which sorts, so the same members
    // always arrive in the same positions.
    const a = viewersFrom(state({ z: ["u2"], a: ["u1"] }));
    const b = viewersFrom(state({ a: ["u1"], z: ["u2"] }));

    expect(a).toEqual(["u1", "u2"]);
    expect(sameViewers(a, b)).toBe(true);
  });
});
