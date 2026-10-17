import { describe, expect, it } from "vitest";

import type { Sprint } from "@/types/data";
import { editableSprint } from "./activeSprint";

const sprint = (id: string, state: string) => ({ id, state }) as Sprint;

describe("editableSprint", () => {
  const sprints = [sprint("a", "future"), sprint("b", "active")];

  it("is the running sprint for an editor with sprints on", () => {
    expect(editableSprint(sprints, true, true)?.id).toBe("b");
  });

  it("is nothing for a viewer, with sprints off, or with none running", () => {
    expect(editableSprint(sprints, true, false)).toBeNull();
    expect(editableSprint(sprints, false, true)).toBeNull();
    expect(editableSprint([sprint("a", "future")], true, true)).toBeNull();
  });
});
