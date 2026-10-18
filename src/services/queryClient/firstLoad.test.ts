import { describe, expect, it } from "vitest";

import { awaitingFirstAnswer } from "./firstLoad";

const pending = { isPending: true, failureCount: 0, errorUpdatedAt: 0 };

describe("awaitingFirstAnswer", () => {
  it("holds while the first attempt is in flight", () => {
    expect(awaitingFirstAnswer(pending)).toBe(true);
  });

  it("releases once data arrives", () => {
    expect(awaitingFirstAnswer({ ...pending, isPending: false })).toBe(false);
  });

  it("releases on the first failed attempt, so the view shows its own retry and error", () => {
    expect(awaitingFirstAnswer({ ...pending, failureCount: 1 })).toBe(false);
  });

  // The loop: a failed query refetched by a remounting view reads pending again.
  it("stays released when a failed query is pending again", () => {
    expect(
      awaitingFirstAnswer({ ...pending, errorUpdatedAt: 1_700_000_000 }),
    ).toBe(false);
  });
});
