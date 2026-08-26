import { describe, expect, it } from "vitest";

import { toCardContent } from "./toCardContent";
import type { TodoCardProps } from "@/components/todo/TodoCard";
import type { Todo } from "@/types/data";

/** A board row, as `fetchTodos` returns one after M5-07's narrowing. */
const row: Todo = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  board_id: "11111111-1111-4111-8111-111111111111",
  column_id: "22222222-2222-4222-8222-222222222222",
  title: "Ship the thing",
  board_key: 7,
  type: "task",
  start_date: null,
  due_date: "2026-08-20T00:00:00.000Z",
  assignee_id: "33333333-3333-4333-8333-333333333333",
  priority: "high",
  estimate: null,
  parent_id: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: null,
  position: 3,
  rank: 4096,
};

describe("toCardContent", () => {
  it("maps the row onto the card's own field names", () => {
    expect(toCardContent(row, "KAN")).toEqual({
      title: "Ship the thing",
      // Assembled here, not in the card: M14 made the prefix a board setting,
      // so `KAN-7` is the two halves meeting rather than a literal in the JSX.
      taskKey: "KAN-7",
      workType: "task",
      priority: "high",
      dueDate: "2026-08-20T00:00:00.000Z",
      estimate: null,
    });
  });

  it("uses the board's own prefix rather than a hardcoded one", () => {
    // The regression M14 exists to prevent: two boards both rendering KAN-1.
    expect(toCardContent(row, "OPS").taskKey).toBe("OPS-7");
  });

  it("drops every column the card does not render", () => {
    const content = toCardContent(row, "KAN") as unknown as Record<
      string,
      unknown
    >;

    // The board fetches fourteen columns (M5-07, widened by M6-A's `rank` and
    // M24's `estimate`); the card renders six since M24-B gave it `estimate`.
    // These are the other eight — `id`/`board_id`/`column_id` because M5-02
    // left identity with the container, the rest because they drive
    // filtering, sorting and ordering rather than the card's own markup.
    for (const column of [
      "id",
      "board_id",
      "column_id",
      "position",
      "rank",
      "assignee_id",
      "created_at",
      "updated_at",
    ]) {
      expect(content).not.toHaveProperty(column);
    }
  });

  it("preserves the nulls the schema allows", () => {
    // `type` is not among them: `todos.type` is NOT NULL with a default, which
    // is why the compiler refuses a null here and why the card's chip always
    // has a value to render.
    const bare = toCardContent(
      {
        ...row,
        title: null,
        board_key: null,
        due_date: null,
      },
      "KAN",
    );

    expect(bare.title).toBeNull();
    // board_key is null for the moment a freshly created card is in flight —
    // that absence is the pending state, so it must survive the mapping as a
    // null key rather than as the string "KAN-null".
    expect(bare.taskKey).toBeNull();
    expect(bare.dueDate).toBeNull();
  });
});

describe("TodoCardProps", () => {
  it("can be built by hand, with no row, query client or board", () => {
    // The plan's acceptance test for M5-01, tightened by M5-02: the card is
    // now presentational, so a complete props object is content plus
    // callbacks — no database row, and nothing that reaches the network.
    const noop = () => {};

    const props: TodoCardProps = {
      title: "A card with no row behind it",
      taskKey: "KAN-1",
      workType: "bug",
      priority: null,
      dueDate: null,
      estimate: null,
      draft: "A card with no row behind it",
      editing: false,
      canEdit: true,
      onDraftChange: noop,
      onSave: noop,
      onCancel: noop,
      onStartEdit: noop,
      onWorkTypeChange: noop,
      onPriorityChange: noop,
      onDueDateChange: noop,
      onEstimateChange: noop,
    };

    expect(props.title).toBe("A card with no row behind it");
    expect(props.editing).toBe(false);
  });
});
