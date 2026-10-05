import { describe, expect, it } from "vitest";

import { loginPath, safeNext } from "./nextPath";

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

describe("loginPath", () => {
  function nextOf(path: string): string | null {
    return new URLSearchParams(path.split("?")[1] ?? "").get("next");
  }

  it("carries a task reference through sign-in and back", () => {
    const path = loginPath({ pathname: "/tasks/API-23", search: "" });

    expect(path).toBe("/login?next=%2Ftasks%2FAPI-23");
    expect(safeNext(nextOf(path))).toBe("/tasks/API-23");
  });

  it("keeps the query string, encoded so it stays one parameter", () => {
    const path = loginPath({
      pathname: "/boards/b1",
      search: "?task=t1&view=list",
    });

    expect(path).toBe("/login?next=%2Fboards%2Fb1%3Ftask%3Dt1%26view%3Dlist");
    expect(nextOf(path)).toBe("/boards/b1?task=t1&view=list");
  });

  it("adds nothing for the home page", () => {
    expect(loginPath({ pathname: "/", search: "" })).toBe("/login");
  });

  it("drops a destination safeNext would refuse", () => {
    expect(loginPath({ pathname: "//evil.test", search: "" })).toBe("/login");
    expect(loginPath({ pathname: "/\\evil.test", search: "" })).toBe("/login");
  });
});
