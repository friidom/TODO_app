import { describe, expect, it } from "vitest";

import { sameViewers, viewersFrom, type PresenceState } from "./presence";

const AT = "2026-08-18T09:00:00Z";

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
    // regression: first version filtered the viewer out, so solo and two-up looked different
    expect(viewersFrom(state({ "user-a": ["user-a"] }))).toEqual(["user-a"]);
  });

  it("lists everyone connected, not just the others", () => {
    const board = state({ "user-a": ["user-a"], "user-b": ["user-b"] });

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
    // no tombstones — a leave is just a state without that key
    const before = state({ a: ["a"], b: ["b"], c: ["c"] });
    const after = state({ a: ["a"], c: ["c"] });

    expect(viewersFrom(before)).toContain("b");
    expect(viewersFrom(after)).toEqual(["a", "c"]);
  });

  it("counts one person with two tabs once", () => {
    expect(viewersFrom(state({ "user-b": ["user-b", "user-b"] }))).toEqual([
      "user-b",
    ]);
  });

  it("dedupes the same person appearing under two keys", () => {
    expect(viewersFrom(state({ k1: ["dup"], k2: ["dup"] }))).toEqual(["dup"]);
  });

  it("is ordered stably, so avatars do not swap places on reconnect", () => {
    const one = viewersFrom(state({ z: ["z"], a: ["a"], m: ["m"] }));
    const other = viewersFrom(state({ m: ["m"], z: ["z"], a: ["a"] }));

    expect(one).toEqual(["a", "m", "z"]);
    expect(other).toEqual(one);
  });

  it("gives nobody special treatment — there is no self to sort first", () => {
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
    // viewersFrom allocates a fresh array each time — this must return true or the board repaints for nothing
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
    expect(sameViewers(["u1", "u2"], ["u1", "u3"])).toBe(false);
  });

  it("treats two empty rosters as equal", () => {
    expect(sameViewers([], [])).toBe(true);
  });

  it("compares element-wise, which viewersFrom's sort is what licenses", () => {
    const a = viewersFrom(state({ z: ["u2"], a: ["u1"] }));
    const b = viewersFrom(state({ a: ["u1"], z: ["u2"] }));

    expect(a).toEqual(["u1", "u2"]);
    expect(sameViewers(a, b)).toBe(true);
  });
});
