import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NODE_H } from "./diagramLayout";
import {
  mergePositions,
  normalizePositions,
  readPositions,
  writePositions,
} from "./diagramPositions";

describe("normalizePositions", () => {
  it("keeps finite points and drops everything else", () => {
    expect(
      normalizePositions({
        a: { x: 1, y: 2 },
        b: { x: "1", y: 2 },
        c: { x: Infinity, y: 0 },
        d: null,
      }),
    ).toEqual({ a: { x: 1, y: 2 } });
  });

  it("survives a stored value that is not an object", () => {
    expect(normalizePositions([1, 2])).toEqual({});
    expect(normalizePositions("x")).toEqual({});
  });
});

describe("mergePositions", () => {
  it("keeps where the reader put a status and drops statuses that are gone", () => {
    const merged = mergePositions(
      ["a"],
      { a: { x: 500, y: 40 }, gone: { x: 0, y: 0 } },
      { a: { x: 0, y: 0 } },
    );

    expect(merged).toEqual({ a: { x: 500, y: 40 } });
  });

  it("places a status with no stored spot clear of the ones that have one", () => {
    const merged = mergePositions(
      ["a", "b"],
      { a: { x: 0, y: 0 } },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } },
    );

    expect(merged.b!.y).toBeGreaterThanOrEqual(NODE_H);
  });
});

describe("storage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips per board", () => {
    writePositions("board-1", { a: { x: 1, y: 2 } });

    expect(readPositions("board-1")).toEqual({ a: { x: 1, y: 2 } });
    expect(readPositions("board-2")).toEqual({});
  });

  it("reads nothing rather than throwing on unreadable storage", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readPositions("board-1")).toEqual({});
  });

  it("reads nothing from a corrupt entry", () => {
    store.set("workflow:positions:board-1", "{not json");

    expect(readPositions("board-1")).toEqual({});
  });
});
