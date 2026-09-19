import { afterEach, describe, expect, it } from "vitest";

import { addViewer, removeViewer, resetPresence, viewersOf } from "./presence.js";

const BOARD = "board-1";
const OTHER = "board-2";

afterEach(resetPresence);

describe("viewersOf", () => {
  it("is empty for a board nobody is on", () => {
    expect(viewersOf(BOARD)).toEqual([]);
  });

  it("lists the first arrival", () => {
    addViewer(BOARD, "alex", "s1");

    expect(viewersOf(BOARD)).toEqual(["alex"]);
  });

  it("grows as people arrive", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(BOARD, "bo", "s2");

    expect(viewersOf(BOARD)).toEqual(["alex", "bo"]);
  });

  it("COUNTS ONE PERSON WITH TWO TABS ONCE", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(BOARD, "alex", "s2");

    expect(viewersOf(BOARD)).toEqual(["alex"]);
  });

  it("keeps that person present until their LAST tab leaves", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(BOARD, "alex", "s2");

    removeViewer(BOARD, "alex", "s1");
    expect(viewersOf(BOARD)).toEqual(["alex"]);

    removeViewer(BOARD, "alex", "s2");
    expect(viewersOf(BOARD)).toEqual([]);
  });

  it("drops someone when they leave", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(BOARD, "bo", "s2");

    removeViewer(BOARD, "bo", "s2");

    expect(viewersOf(BOARD)).toEqual(["alex"]);
  });

  it("never lists a duplicate, however many times the same socket is added", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(BOARD, "alex", "s1");
    addViewer(BOARD, "alex", "s1");

    expect(viewersOf(BOARD)).toEqual(["alex"]);

    removeViewer(BOARD, "alex", "s1");

    expect(viewersOf(BOARD)).toEqual([]);
  });

  it("is ordered stably, so avatars do not swap places on reconnect", () => {
    addViewer(BOARD, "zoe", "s1");
    addViewer(BOARD, "alex", "s2");
    addViewer(BOARD, "mo", "s3");

    expect(viewersOf(BOARD)).toEqual(["alex", "mo", "zoe"]);
  });

  it("keeps boards isolated from each other", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(OTHER, "bo", "s2");

    expect(viewersOf(BOARD)).toEqual(["alex"]);
    expect(viewersOf(OTHER)).toEqual(["bo"]);
  });

  it("removes one board's entry without disturbing the other", () => {
    addViewer(BOARD, "alex", "s1");
    addViewer(OTHER, "alex", "s2");

    removeViewer(BOARD, "alex", "s1");

    expect(viewersOf(BOARD)).toEqual([]);
    expect(viewersOf(OTHER)).toEqual(["alex"]);
  });
});

describe("removeViewer", () => {
  it("survives a board, a user and a socket it has never seen", () => {
    expect(() => removeViewer("nope", "nobody", "s0")).not.toThrow();

    addViewer(BOARD, "alex", "s1");

    expect(() => removeViewer(BOARD, "alex", "other-socket")).not.toThrow();
    expect(viewersOf(BOARD)).toEqual(["alex"]);
  });
});
