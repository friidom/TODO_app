import { describe, expect, it } from "vitest";

import {
  partitionFields,
  readPinnedFields,
  togglePinned,
  writePinnedFields,
} from "./pinnedFields";

function memory(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));

  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

describe("pinned fields", () => {
  it("round-trips per user", () => {
    const store = memory();

    writePinnedFields("a", ["dueDate"], store);

    expect(readPinnedFields("a", store)).toEqual(["dueDate"]);
    expect(readPinnedFields("b", store)).toEqual([]);
    expect(readPinnedFields(undefined, store)).toEqual([]);
  });

  it("survives a hand-edited value", () => {
    expect(
      readPinnedFields("a", memory({ "task:pinned-fields:a": "{" })),
    ).toEqual([]);
    expect(
      readPinnedFields(
        "a",
        memory({ "task:pinned-fields:a": '["x", 3, "x"]' }),
      ),
    ).toEqual(["x"]);
  });

  it("toggles", () => {
    expect(togglePinned(["a"], "b")).toEqual(["a", "b"]);
    expect(togglePinned(["a", "b"], "a")).toEqual(["b"]);
  });

  it("moves pinned fields out, in pin order, skipping ones not shown", () => {
    const fields = [{ key: "a" }, { key: "b" }, { key: "c" }];
    const { pinned, rest } = partitionFields(fields, ["c", "gone", "a"]);

    expect(pinned.map((f) => f.key)).toEqual(["c", "a"]);
    expect(rest.map((f) => f.key)).toEqual(["b"]);
  });
});
