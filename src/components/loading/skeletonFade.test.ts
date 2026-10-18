import { describe, expect, it } from "vitest";

import { createFadeTracker } from "./skeletonFade";

function setup() {
  let time = 0;

  return {
    tracker: createFadeTracker(() => time),
    at: (ms: number) => {
      time = ms;
    },
  };
}

// What separates one commit from the next.
const nextCommit = () => Promise.resolve();

describe("skeleton fade across a load's hand-offs", () => {
  it("delays the first skeleton of a cold load, so a fast load never flashes grey", () => {
    const { tracker } = setup();

    expect(tracker.mount()).toBeNull();
  });

  it("continues the running fade when one commit swaps the session spinner for the page skeleton", () => {
    const { tracker, at } = setup();

    tracker.mount();

    at(100);
    tracker.unmount();
    expect(tracker.mount()).toBe(50);

    at(400);
    tracker.unmount();
    // Already past the delay and the fade: visible from its first frame.
    expect(tracker.mount()).toBe(-250);
  });

  it("continues when the next skeleton mounts while the previous is still up", () => {
    const { tracker, at } = setup();

    tracker.mount();

    at(300);
    expect(tracker.mount()).toBe(-150);
  });

  it("keeps the sequence's start through a chain of hand-offs on a slow request", () => {
    const { tracker, at } = setup();

    tracker.mount();

    at(300);
    tracker.unmount();
    tracker.mount();

    at(2_000);
    tracker.unmount();
    expect(tracker.mount()).toBe(-1850);
  });

  it("starts a fresh delayed fade for a new load once content has been shown", async () => {
    const { tracker, at } = setup();

    tracker.mount();

    at(500);
    tracker.unmount();
    await nextCommit();

    at(5_000);
    expect(tracker.mount()).toBeNull();

    at(5_100);
    tracker.unmount();
    expect(tracker.mount()).toBe(50);
  });

  it("lets skeletons mounting together share one start", () => {
    const { tracker, at } = setup();

    expect(tracker.mount()).toBeNull();
    at(10);
    expect(tracker.mount()).toBe(140);
  });
});
