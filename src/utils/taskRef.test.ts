import { describe, expect, it } from "vitest";

import { issueHref, splitTaskRefs } from "./taskRef";

const refs = (text: string, prefixes?: ReadonlySet<string>) =>
  splitTaskRefs(text, prefixes)
    .filter((segment) => segment.kind === "ref")
    .map((segment) => segment.text);

describe("splitTaskRefs", () => {
  it("keeps the surrounding text exactly as written", () => {
    const text = "Kamoliddin updated KAN-28 and changed its status to Done.";

    expect(
      splitTaskRefs(text)
        .map((segment) => segment.text)
        .join(""),
    ).toBe(text);

    expect(splitTaskRefs(text)).toEqual([
      { kind: "text", text: "Kamoliddin updated " },
      { kind: "ref", text: "KAN-28", prefix: "KAN", number: 28 },
      { kind: "text", text: " and changed its status to Done." },
    ]);
  });

  it("finds several references, repeats included, next to punctuation", () => {
    expect(refs("(KAN-1), KAN-2; see KAN-1. Then API-30!")).toEqual([
      "KAN-1",
      "KAN-2",
      "KAN-1",
      "API-30",
    ]);
  });

  it("does not link inside a longer token", () => {
    expect(refs("XKAN-1 KAN-1a KAN-01 kan-1 KAN-0", new Set(["KAN"]))).toEqual(
      [],
    );
  });

  it("keeps a number a card key cannot hold as text", () => {
    expect(refs("KAN-2147483647 KAN-2147483648")).toEqual(["KAN-2147483647"]);
  });

  it("refuses a prefix no board key could have", () => {
    expect(refs("A-1 ABCDEFGHIJK-1 ABCDEFGHIJ-1")).toEqual(["ABCDEFGHIJ-1"]);
  });

  it("links only the boards it is told about when given a list", () => {
    expect(refs("ISO-8601 and KAN-4", new Set(["KAN"]))).toEqual(["KAN-4"]);
  });

  it("hands back plain text untouched when there is nothing to link", () => {
    expect(splitTaskRefs("nothing here")).toEqual([
      { kind: "text", text: "nothing here" },
    ]);
    expect(splitTaskRefs("")).toEqual([]);
  });
});

describe("issueHref", () => {
  it("goes straight to the board overlay when the target is known", () => {
    expect(issueHref("KAN-2", { boardId: "b-1", todoId: "t-9" })).toBe(
      "/boards/b-1?task=t-9",
    );
  });

  it("falls back to the route that resolves a key on the server", () => {
    expect(issueHref("KAN-2")).toBe("/tasks/KAN-2");
  });
});
