import { describe, expect, it } from "vitest";

import type { IStatus, Todo } from "@/types/data";
import { epicChoices, filterEpicChoices } from "./epicChoices";

const status = (id: string, category: IStatus["category"]) =>
  ({ id, category, column_id: `c-${id}`, is_hidden: false }) as IStatus;

const STATUSES = [status("todo", "todo"), status("done", "done")];

const todo = (over: Partial<Todo> & { id: string }) =>
  ({
    parent_id: null,
    type: "Task",
    status_id: "todo",
    board_key: 1,
    title: over.id,
    ...over,
  }) as Todo;

const TODOS = [
  todo({ id: "auth", type: "Epic", board_key: 1, title: "Auth" }),
  todo({
    id: "old",
    type: "Epic",
    board_key: 2,
    title: "Legacy",
    status_id: "done",
  }),
  todo({ id: "t1", parent_id: "auth" }),
  todo({ id: "t2", parent_id: "auth", status_id: "done" }),
];

describe("epicChoices", () => {
  it("counts each Epic's done and total Tasks", () => {
    const [auth, old] = epicChoices(TODOS, STATUSES, "KAN");

    expect(auth).toMatchObject({
      key: "KAN-1",
      done: 1,
      total: 2,
      isDone: false,
    });
    expect(old).toMatchObject({ total: 0, isDone: true });
  });

  it("hides finished Epics unless asked, but never the chosen one", () => {
    const choices = epicChoices(TODOS, STATUSES, "KAN");
    const ids = (opts: Parameters<typeof filterEpicChoices>[1]) =>
      filterEpicChoices(choices, opts).map((c) => c.epic.id);

    expect(ids({ query: "", showDone: false, selectedId: null })).toEqual([
      "auth",
    ]);
    expect(ids({ query: "", showDone: true, selectedId: null })).toEqual([
      "auth",
      "old",
    ]);
    expect(ids({ query: "", showDone: false, selectedId: "old" })).toEqual([
      "auth",
      "old",
    ]);
  });

  it("searches title and key", () => {
    const choices = epicChoices(TODOS, STATUSES, "KAN");

    expect(
      filterEpicChoices(choices, {
        query: "kan-1",
        showDone: true,
        selectedId: null,
      }).map((c) => c.epic.id),
    ).toEqual(["auth"]);
    expect(
      filterEpicChoices(choices, {
        query: "legacy",
        showDone: true,
        selectedId: null,
      }).length,
    ).toBe(1);
  });
});
