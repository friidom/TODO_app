import { describe, expect, it } from "vitest";

import type { IColumn, Todo } from "@/types/data";

import {
  boardDragReducer,
  EMPTY_INDICATOR,
  IDLE,
  SETTLE_DISTANCE,
  type BoardDragAction,
  type BoardDragState,
} from "./boardDrag";

const todo = { id: "t1" } as Todo;
const column = { id: "c1" } as IColumn;

function run(actions: BoardDragAction[], from: BoardDragState = IDLE) {
  return actions.reduce(boardDragReducer, from);
}

const overGap: BoardDragAction = {
  type: "over",
  data: { type: "todo-gap", columnId: "c2", index: 3 },
};

describe("boardDragReducer", () => {
  it("lights the gap a card is over", () => {
    const state = run([{ type: "pick-todo", todo }, overGap]);

    expect(state.activeTodo).toBe(todo);
    expect(state.indicator).toEqual({ columnId: "c2", index: 3 });
  });

  it("clears every indicator and the dragged item when a drag ends, whether dropped or cancelled", () => {
    const card = run([{ type: "pick-todo", todo }, overGap, { type: "end" }]);
    const col = run([
      { type: "pick-column", column },
      { type: "over", data: { type: "column-gap", index: 2 } },
      { type: "end" },
    ]);

    for (const state of [card, col]) {
      expect(state.activeTodo).toBeNull();
      expect(state.activeColumn).toBeNull();
      expect(state.indicator).toBe(EMPTY_INDICATOR);
      expect(state.columnIndicator).toBeNull();
    }
  });

  it("clears the indicator when the pointer leaves every column", () => {
    const state = run([
      { type: "pick-todo", todo },
      overGap,
      { type: "over", data: undefined },
    ]);

    expect(state.indicator).toBe(EMPTY_INDICATOR);
    expect(state.activeTodo).toBe(todo);
  });

  it("names a status zone's status and lights none of the column's gaps", () => {
    const state = run([
      { type: "pick-todo", todo },
      overGap,
      {
        type: "over",
        data: { type: "status-zone", columnId: "c3", statusId: "s9" },
      },
    ]);

    expect(state.indicator).toEqual({
      columnId: "c3",
      index: 0,
      statusId: "s9",
    });
  });

  it("keeps the create control quiet after a drop until the pointer really moves", () => {
    const dropped = run([
      { type: "pick-todo", todo },
      overGap,
      { type: "end" },
    ]);

    expect(dropped.settling).toBe(true);

    const nudged = run(
      [
        { type: "pointer", x: 100, y: 100 },
        { type: "pointer", x: 101, y: 102 },
      ],
      dropped,
    );

    expect(nudged.settling).toBe(true);

    const moved = boardDragReducer(nudged, {
      type: "pointer",
      x: 100 + SETTLE_DISTANCE,
      y: 100,
    });

    expect(moved.settling).toBe(false);
  });

  it("ignores the pointer when nothing is settling, without a new state", () => {
    expect(boardDragReducer(IDLE, { type: "pointer", x: 5, y: 5 })).toBe(IDLE);
  });

  it("drops a pending settle when the next drag starts", () => {
    const state = run([
      { type: "pick-todo", todo },
      { type: "end" },
      { type: "pick-column", column },
    ]);

    expect(state.settling).toBe(false);
    expect(state.activeColumn).toBe(column);
  });
});
