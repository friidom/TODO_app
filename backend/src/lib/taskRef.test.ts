import { describe, expect, it } from "vitest";

import { formatTaskRef, parseTaskRef } from "./taskRef.js";

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
