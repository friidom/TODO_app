import { describe, expect, it } from "vitest";

import { latestWrite, writtenTodoId } from "./saveState";

describe("writtenTodoId", () => {
  it("reads a field patch, a move and a scoped write", () => {
    expect(writtenTodoId({ id: "t1", board_id: "b" }, undefined)).toBe("t1");
    expect(writtenTodoId({ activeTodo: { id: "t2" } }, undefined)).toBe("t2");
    expect(writtenTodoId({ name: "bug", on: true }, "labels:t3")).toBe("t3");
    expect(writtenTodoId(undefined, undefined)).toBeNull();
  });
});

describe("latestWrite", () => {
  it("is the one submitted last", () => {
    expect(
      latestWrite([
        { status: "success", submittedAt: 1 },
        { status: "pending", submittedAt: 3 },
        { status: "error", submittedAt: 2 },
      ])?.status,
    ).toBe("pending");
    expect(latestWrite([])).toBeNull();
  });
});
