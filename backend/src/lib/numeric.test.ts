import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { toNumber } from "./numeric.js";

describe("toNumber", () => {
  it("keeps null and undefined as null", () => {
    // null and 0 are different answers for an estimate — an unestimated item
    // is not a zero-point one (M24).
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(0)).toBe(0);
  });

  it("converts a bigint position", () => {
    expect(toNumber(0n)).toBe(0);
    expect(toNumber(3n)).toBe(3);
  });

  it("converts a Decimal estimate, fraction and all", () => {
    expect(toNumber(new Prisma.Decimal("5"))).toBe(5);
    expect(toNumber(new Prisma.Decimal("0.5"))).toBe(0.5);
    expect(toNumber(new Prisma.Decimal("13"))).toBe(13);
    expect(toNumber(new Prisma.Decimal("0"))).toBe(0);
  });

  it("passes a number through unchanged", () => {
    expect(toNumber(1536.5)).toBe(1536.5);
  });

  it("produces values JSON.stringify can actually carry", () => {
    // The whole reason this function exists: both inputs are unserialisable
    // as themselves — one throws, one silently becomes a string.
    expect(() => JSON.stringify({ position: 3n })).toThrow(TypeError);
    expect(JSON.stringify({ estimate: new Prisma.Decimal("5") })).toBe('{"estimate":"5"}');

    expect(
      JSON.stringify({ position: toNumber(3n), estimate: toNumber(new Prisma.Decimal("5")) }),
    ).toBe('{"position":3,"estimate":5}');
  });
});
