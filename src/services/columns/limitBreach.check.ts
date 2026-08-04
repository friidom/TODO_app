/**
 * Self-check for `limitBreach`. No test runner installed, so run it directly:
 *
 *   node --experimental-strip-types src/services/columns/limitBreach.check.ts
 */
import assert from "node:assert/strict";

import { limitBreach } from "./limitBreach.ts";

const column = (min: number | null, max: number | null) => ({
  title: "In Review",
  min_limit: min,
  max_limit: max,
});

// no limits set — never warns
assert.equal(limitBreach(column(null, null), 0), null);
assert.equal(limitBreach(column(null, null), 999), null);

// under the minimum
assert.equal(
  limitBreach(column(4, null), 3),
  "3 work items in In Review. Minimum is 4.",
);

// over the maximum
assert.equal(
  limitBreach(column(null, 5), 6),
  "6 work items in In Review. Maximum is 5.",
);

// boundaries are inclusive — exactly at the limit is fine
assert.equal(limitBreach(column(4, 5), 4), null);
assert.equal(limitBreach(column(4, 5), 5), null);

// zero is a real minimum, not "unset"
assert.equal(limitBreach(column(0, null), 0), null);

// a max of 0 warns as soon as anything lands
assert.equal(
  limitBreach(column(null, 0), 1),
  "1 work items in In Review. Maximum is 0.",
);

// both breached is impossible, but max wins the report if data is bad
assert.equal(
  limitBreach(column(10, 2), 5),
  "5 work items in In Review. Maximum is 2.",
);

console.log("limitBreach: all checks passed");
