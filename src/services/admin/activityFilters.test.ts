import { describe, expect, it } from "vitest";

import { actionOptions } from "./activityFilters";

const rows = (...actions: string[]) => actions.map((action) => ({ action }));

describe("actionOptions", () => {
  it("offers each action the feed carries, once, in order", () => {
    expect(actionOptions(rows("moved", "created", "moved"), undefined)).toEqual(
      ["created", "moved"],
    );
  });

  it("is empty when nothing is loaded and nothing is filtered", () => {
    expect(actionOptions([], undefined)).toEqual([]);
  });

  // The bug: the filter narrows the feed to nothing, so the option that would
  // display it is missing and the select falls back to showing "Every action".
  it("keeps the active action when the filtered feed came back empty", () => {
    expect(actionOptions([], "commented")).toEqual(["commented"]);
  });

  it("does not repeat the active action when the rows carry it too", () => {
    expect(actionOptions(rows("commented", "commented"), "commented")).toEqual([
      "commented",
    ]);
  });

  it("keeps an action the loaded page happens not to contain", () => {
    expect(actionOptions(rows("moved"), "deleted")).toEqual([
      "deleted",
      "moved",
    ]);
  });
});
