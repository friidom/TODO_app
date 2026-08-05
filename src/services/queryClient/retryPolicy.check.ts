/**
 * Self-check for the query retry policy. No test runner installed, so run it
 * directly:
 *
 *   node --experimental-strip-types src/services/queryClient/retryPolicy.check.ts
 */
import assert from "node:assert/strict";

import {
  MAX_QUERY_RETRIES,
  isRetryableError,
  retryQuery,
} from "./retryPolicy.ts";

// --- PostgREST: a code, never a status -------------------------------------

// The failure this policy exists for. RLS denies the row; asking again denies
// it again.
assert.equal(
  isRetryableError({ code: "42501", message: "permission denied" }),
  false,
);

// PostgREST's own codes: expired JWT, no matching row. Neither is transient.
assert.equal(isRetryableError({ code: "PGRST301" }), false);
assert.equal(isRetryableError({ code: "PGRST116" }), false);

// Integrity violations are decided by the data, not by the moment.
assert.equal(isRetryableError({ code: "23505" }), false);
assert.equal(isRetryableError({ code: "23503" }), false);

// Connection and resource classes are about the server right now.
assert.equal(isRetryableError({ code: "08006" }), true); // connection failure
assert.equal(isRetryableError({ code: "53300" }), true); // too many connections
assert.equal(isRetryableError({ code: "57P03" }), true); // cannot connect now
assert.equal(isRetryableError({ code: "58030" }), true); // io error

// Concurrency: both succeed on a second attempt.
assert.equal(isRetryableError({ code: "40001" }), true); // serialization failure
assert.equal(isRetryableError({ code: "40P01" }), true); // deadlock detected

// A five-character prefix match must not catch a longer code that happens to
// start with a transient class.
assert.equal(isRetryableError({ code: "08006XX" }), false);

// --- Errors that do carry a status -----------------------------------------

assert.equal(isRetryableError({ status: 401 }), false);
assert.equal(isRetryableError({ status: 403 }), false);
assert.equal(isRetryableError({ status: 404 }), false);
assert.equal(isRetryableError({ status: 422 }), false);

assert.equal(isRetryableError({ status: 500 }), true);
assert.equal(isRetryableError({ status: 503 }), true);

// The two 4xx that ask to be repeated.
assert.equal(isRetryableError({ status: 408 }), true);
assert.equal(isRetryableError({ status: 429 }), true);

// Storage reports its status as a string.
assert.equal(isRetryableError({ statusCode: "413" }), false);
assert.equal(isRetryableError({ statusCode: "503" }), true);

// A status wins over a code when both are present.
assert.equal(isRetryableError({ status: 503, code: "42501" }), true);

// --- Unrecognised shapes ---------------------------------------------------

// What a failed fetch actually throws. This is the case retrying is for.
assert.equal(isRetryableError(new TypeError("Failed to fetch")), true);

assert.equal(isRetryableError(null), true);
assert.equal(isRetryableError(undefined), true);
assert.equal(isRetryableError("boom"), true);
assert.equal(isRetryableError({}), true);

// A non-string code is not a code.
assert.equal(isRetryableError({ code: 42501 }), true);

// --- Counting --------------------------------------------------------------

const transient = new TypeError("Failed to fetch");
const permanent = { code: "42501" };

// TanStack passes 0 on the first failure, so MAX_QUERY_RETRIES of 2 means
// attempts at failureCount 0 and 1: three requests in total.
assert.equal(MAX_QUERY_RETRIES, 2);
assert.equal(retryQuery(0, transient), true);
assert.equal(retryQuery(1, transient), true);
assert.equal(retryQuery(2, transient), false);

// A permanent failure surfaces on the first attempt, not the third.
assert.equal(retryQuery(0, permanent), false);

console.log("retryPolicy: all checks passed");
