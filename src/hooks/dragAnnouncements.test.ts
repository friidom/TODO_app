import { describe, expect, it } from "vitest";

import {
  SCREEN_READER_INSTRUCTIONS,
  announceCancelled,
  announceDropped,
  announceMovedOver,
  announcePickedUp,
  describeColumnPosition,
  describePosition,
  itemLabel,
} from "./dragAnnouncements";

describe("describePosition", () => {
  it("is one-based and names the column", () => {
    expect(describePosition(0, 4, "In Progress")).toBe(
      "position 1 of 4 in In Progress",
    );
    expect(describePosition(2, 4, "Done")).toBe("position 3 of 4 in Done");
  });

  it("takes the number of PLACES, not the number of cards", () => {
    // a column of three cards has four gaps — card count would put the last position out of range
    expect(describePosition(3, 4, "Todo")).toBe("position 4 of 4 in Todo");
  });
});

describe("describeColumnPosition", () => {
  it("omits the column, because a column is not in one", () => {
    expect(describeColumnPosition(1, 3)).toBe("position 2 of 3");
  });
});

describe("announcements", () => {
  it("names what moved and where it is", () => {
    expect(announcePickedUp("KAN-12", "position 1 of 4 in Todo")).toBe(
      "Picked up KAN-12. It is at position 1 of 4 in Todo.",
    );

    expect(announceMovedOver("KAN-12", "position 3 of 4 in Done")).toBe(
      "KAN-12 is over position 3 of 4 in Done.",
    );

    expect(announceDropped("KAN-12", "position 3 of 4 in Done")).toBe(
      "KAN-12 was dropped at position 3 of 4 in Done.",
    );
  });

  it("SAYS SO OUT LOUD when there is no drop target", () => {
    expect(announceMovedOver("KAN-12", null)).toBe(
      "KAN-12 is not over a drop position.",
    );

    expect(announceDropped("KAN-12", null)).toBe(
      "KAN-12 was returned to where it started.",
    );
  });

  it("does not repeat the key instructions on every lift", () => {
    const picked = announcePickedUp("KAN-12", "position 1 of 4 in Todo");

    expect(picked).not.toContain("arrow keys");
    expect(picked).not.toContain("escape");
  });

  it("explains the cancel rather than just reporting it", () => {
    expect(announceCancelled("Done")).toBe(
      "Dragging Done was cancelled. It returned to where it started.",
    );
  });

  it("names all three keys in the focus instructions", () => {
    expect(SCREEN_READER_INSTRUCTIONS).toContain("space");
    expect(SCREEN_READER_INSTRUCTIONS).toContain("arrow keys");
    expect(SCREEN_READER_INSTRUCTIONS).toContain("escape");
  });
});

describe("itemLabel", () => {
  it("leads with the key, which is the name people say", () => {
    expect(itemLabel("KAN-12", "Fix the login bug")).toBe(
      "KAN-12, Fix the login bug",
    );
  });

  it("carries a card that has no key yet on its title alone", () => {
    expect(itemLabel(null, "Fix the login bug")).toBe("Fix the login bug");
  });

  it("never returns an empty name", () => {
    expect(itemLabel(null, null)).toBe("Untitled item");
    expect(itemLabel(null, "")).toBe("Untitled item");
  });
});
