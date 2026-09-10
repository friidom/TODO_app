import { describe, expect, it } from "vitest";

import { safeNext } from "./nextPath";

describe("safeNext", () => {
  it("returns an in-app path unchanged", () => {
    expect(safeNext("/invite/abc123")).toBe("/invite/abc123");
    expect(safeNext("/boards/3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(
      "/boards/3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    );
    expect(safeNext("/boards/x?view=list#top")).toBe("/boards/x?view=list#top");
  });

  it("refuses to leave the application", () => {
    expect(safeNext("https://evil.test/login")).toBeNull();
    expect(safeNext("http://evil.test")).toBeNull();
    // protocol-relative — a bare startsWith("/") check would let this through
    expect(safeNext("//evil.test")).toBeNull();
    expect(safeNext("/\\evil.test")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
  });

  it("treats a missing param as no destination", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
});
