import { describe, expect, it } from "vitest";

import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("accepts what the database mints", () => {
    // A real gen_random_uuid() value and a crypto.randomUUID() one.
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(isUuid(crypto.randomUUID())).toBe(true);
  });

  it("accepts either case", () => {
    expect(isUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(true);
  });

  it("rejects a missing param", () => {
    // The route matched without one, which is the shape useParams returns.
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("")).toBe(false);
  });

  it("rejects anything not shaped like a uuid", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("123")).toBe(false);
    // Right groups, wrong lengths.
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c330")).toBe(false);
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c33011")).toBe(false);
    // Non-hex inside an otherwise correct shape.
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c330z")).toBe(false);
    // Postgres would take these; nothing here ever produces them.
    expect(isUuid("3f2504e04f8941d39a0c0305e82c3301")).toBe(false);
    expect(isUuid("{3f2504e0-4f89-41d3-9a0c-0305e82c3301}")).toBe(false);
  });

  it("rejects a uuid with anything appended", () => {
    // The case that matters: a valid prefix must not let a crafted param
    // through to the query.
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301 or 1=1")).toBe(false);
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301\n")).toBe(false);
  });
});
