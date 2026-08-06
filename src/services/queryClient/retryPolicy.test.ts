import { describe, expect, it } from "vitest";

import { MAX_QUERY_RETRIES, isRetryableError, retryQuery } from "./retryPolicy";

describe("isRetryableError", () => {
  // PostgREST errors carry a code and never an HTTP status, which is why the
  // policy cannot read `status` alone.
  describe("PostgREST codes", () => {
    it("does not retry a permission denial — the failure this exists for", () => {
      expect(
        isRetryableError({ code: "42501", message: "permission denied" }),
      ).toBe(false);
    });

    it("does not retry PostgREST's own codes", () => {
      expect(isRetryableError({ code: "PGRST301" })).toBe(false);
      expect(isRetryableError({ code: "PGRST116" })).toBe(false);
    });

    it("does not retry integrity violations, which the data decides", () => {
      expect(isRetryableError({ code: "23505" })).toBe(false);
      expect(isRetryableError({ code: "23503" })).toBe(false);
    });

    it("retries the connection and resource classes", () => {
      expect(isRetryableError({ code: "08006" })).toBe(true); // connection failure
      expect(isRetryableError({ code: "53300" })).toBe(true); // too many connections
      expect(isRetryableError({ code: "57P03" })).toBe(true); // cannot connect now
      expect(isRetryableError({ code: "58030" })).toBe(true); // io error
    });

    it("retries serialization failures and deadlocks", () => {
      expect(isRetryableError({ code: "40001" })).toBe(true);
      expect(isRetryableError({ code: "40P01" })).toBe(true);
    });

    it("does not match a longer code that starts with a transient class", () => {
      expect(isRetryableError({ code: "08006XX" })).toBe(false);
    });
  });

  describe("errors that carry a status", () => {
    it("does not retry 4xx", () => {
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 403 })).toBe(false);
      expect(isRetryableError({ status: 404 })).toBe(false);
      expect(isRetryableError({ status: 422 })).toBe(false);
    });

    it("retries 5xx", () => {
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
    });

    it("retries the two 4xx that ask to be repeated", () => {
      expect(isRetryableError({ status: 408 })).toBe(true);
      expect(isRetryableError({ status: 429 })).toBe(true);
    });

    it("reads the string status Storage reports", () => {
      expect(isRetryableError({ statusCode: "413" })).toBe(false);
      expect(isRetryableError({ statusCode: "503" })).toBe(true);
    });

    it("prefers a status over a code when both are present", () => {
      expect(isRetryableError({ status: 503, code: "42501" })).toBe(true);
    });
  });

  describe("unrecognised shapes", () => {
    it("retries a failed fetch, which is what retrying is for", () => {
      expect(isRetryableError(new TypeError("Failed to fetch"))).toBe(true);
    });

    it("retries anything it cannot read", () => {
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
      expect(isRetryableError("boom")).toBe(true);
      expect(isRetryableError({})).toBe(true);
    });

    it("does not treat a non-string code as a code", () => {
      expect(isRetryableError({ code: 42501 })).toBe(true);
    });
  });
});

describe("retryQuery", () => {
  const transient = new TypeError("Failed to fetch");
  const permanent = { code: "42501" };

  // TanStack passes 0 on the first failure, so MAX_QUERY_RETRIES of 2 means
  // attempts at failureCount 0 and 1: three requests in total.
  it("allows two retries of a transient failure", () => {
    expect(MAX_QUERY_RETRIES).toBe(2);
    expect(retryQuery(0, transient)).toBe(true);
    expect(retryQuery(1, transient)).toBe(true);
    expect(retryQuery(2, transient)).toBe(false);
  });

  it("surfaces a permanent failure on the first attempt, not the third", () => {
    expect(retryQuery(0, permanent)).toBe(false);
  });
});
