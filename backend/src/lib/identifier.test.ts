import { describe, expect, it } from "vitest";

import { normalizeIdentifier } from "./identifier.js";

describe("normalizeIdentifier", () => {
  it("reads anything containing @ as an email", () => {
    expect(normalizeIdentifier("ada@example.com")).toEqual({
      kind: "email",
      value: "ada@example.com",
    });
  });

  // users.email is citext, so the lookup folds case without help here.
  it("trims an email but keeps its case", () => {
    expect(normalizeIdentifier("  Ada@Example.com ")).toEqual({
      kind: "email",
      value: "Ada@Example.com",
    });
  });

  it("normalises a username the way registration stored it", () => {
    expect(normalizeIdentifier("  Ada_Lovelace ")).toEqual({
      kind: "username",
      value: "ada_lovelace",
    });
  });

  it("cannot mistake a username for an email", () => {
    expect(normalizeIdentifier("ada").kind).toBe("username");
    expect(normalizeIdentifier("ada_99").kind).toBe("username");
  });
});
