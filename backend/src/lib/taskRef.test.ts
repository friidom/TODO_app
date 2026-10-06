import { describe, expect, it } from "vitest";

import { findTaskRefs, formatTaskRef, parseTaskRef } from "./taskRef.js";

describe("parseTaskRef", () => {
  it.each([
    ["API-23", { key: "API", number: 23 }],
    ["api-23", { key: "API", number: 23 }],
    ["Api-23", { key: "API", number: 23 }],
    ["MNH2-7", { key: "MNH2", number: 7 }],
    ["AB-1", { key: "AB", number: 1 }],
    ["ABCDEFGHIJ-5", { key: "ABCDEFGHIJ", number: 5 }],
    ["API-2147483647", { key: "API", number: 2147483647 }],
  ])("parses %s", (raw, expected) => {
    expect(parseTaskRef(raw)).toEqual(expected);
  });

  it.each([
    "",
    "API",
    "23",
    "API-",
    "-23",
    "API-abc",
    "API--23",
    "API-0",
    "API-023",
    "API-2147483648",
    "API-99999999999999999999",
    "API-23-4",
    "API_23",
    "API 23",
    " API-23",
    "API-23 ",
    "API-23\n",
    "A-23",
    "ABCDEFGHIJK-23",
    "2FA-23",
    "МНХ-23",
    "API-+23",
    "API-1e3",
    "API-٢٣",
  ])("refuses %j", (raw) => {
    expect(parseTaskRef(raw)).toBeNull();
  });
});

describe("formatTaskRef", () => {
  it("joins a key and a number", () => {
    expect(formatTaskRef("HOB", 23)).toBe("HOB-23");
  });
});

describe("findTaskRefs", () => {
  const refs = (text: string) => findTaskRefs(text).map(({ key, number }) => formatTaskRef(key, number));

  it("finds the reference in a real GitLab commit title", () => {
    expect(findTaskRefs("API-23 gitlab webhook test")).toEqual([
      { key: "API", number: 23, text: "API-23" },
    ]);
  });

  it("finds a lowercase reference and keeps it as written", () => {
    expect(findTaskRefs("api-23 lowercase test and MNH-7 second reference")).toEqual([
      { key: "API", number: 23, text: "api-23" },
      { key: "MNH", number: 7, text: "MNH-7" },
    ]);
  });

  it("returns each task once, first spelling first", () => {
    expect(findTaskRefs("api-23 fix, then API-23 again and Api-23")).toEqual([
      { key: "API", number: 23, text: "api-23" },
    ]);
  });

  it("finds references inside punctuation, branch names and multi-line messages", () => {
    expect(refs("[API-23]: fix (MNH-7),\n\nCloses HOB-15.")).toEqual(["API-23", "MNH-7", "HOB-15"]);
    expect(refs("feature/API-23-auth")).toEqual(["API-23"]);
    expect(refs("Merge branch 'feature/MNH2-4' into 'main'")).toEqual(["MNH2-4"]);
  });

  it("keeps the order the references appear in", () => {
    expect(refs("HOB-1 API-2 MNH-3")).toEqual(["HOB-1", "API-2", "MNH-3"]);
  });

  it.each([
    ["no reference at all", "Initial commit"],
    ["a zero task number", "API-0"],
    ["a leading zero", "API-023"],
    ["a one-letter key", "A-1"],
    ["an eleven-letter key", "ABCDEFGHIJK-1"],
    ["an underscore in the key", "MY_KEY-1"],
    ["a key starting with a digit", "2FA-1"],
    ["a number glued to letters", "API-23abc"],
    ["a number past int4", "API-2147483648"],
    ["a Cyrillic key", "МНХ-23"],
    ["an empty string", ""],
  ])("ignores %s", (_label, text) => {
    expect(findTaskRefs(text)).toEqual([]);
  });

  it("reports syntactically valid keys even when no board uses them", () => {
    expect(refs("utf-8 and sha-256")).toEqual(["UTF-8", "SHA-256"]);
  });

  it("stops at the limit", () => {
    const text = Array.from({ length: 60 }, (_, i) => `API-${i + 1}`).join(" ");

    expect(findTaskRefs(text)).toHaveLength(50);
    expect(findTaskRefs(text, 3).map((ref) => ref.number)).toEqual([1, 2, 3]);
  });
});
