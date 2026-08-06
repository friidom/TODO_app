/**
 * Canonical UUID shape check. Pure — no React, no network.
 *
 * Used to decide whether a route param is worth sending to the database at
 * all. `id=eq.not-a-uuid` is not a miss, it is a type error: Postgres rejects
 * it with "invalid input syntax for type uuid", which surfaces as a thrown
 * query and a "something went wrong" boundary rather than a 404. Screening the
 * param first turns a malformed URL into the answer it deserves.
 *
 * Deliberately canonical 8-4-4-4-12. Postgres itself is looser — it accepts
 * braces and omitted hyphens — but nothing in this application ever mints
 * those, so anything else in a URL was typed or guessed, and 404 is the right
 * response either way.
 */
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID_SHAPE.test(value);
}
