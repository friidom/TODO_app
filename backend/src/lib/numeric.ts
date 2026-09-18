import type { Prisma } from "@prisma/client";

// Prisma returns bigint for int8 (`position`) and Decimal for numeric
// (`estimate`). JSON.stringify THROWS on the first and silently renders the
// second as a string, so neither reaches the client as a number on its own.
//
// A global Express `json replacer` is the obvious fix and does not work:
// stringify calls toJSON before the replacer, so a Decimal is already "5" by
// then and indistinguishable from a real string.
//
// Above 2^53 a bigint loses precision here; `position` is an index within one
// column, so that bound is unreachable.
export function toNumber(
  value: bigint | Prisma.Decimal | number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "number") return value;

  return Number(value);
}
