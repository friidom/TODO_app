import { describe, expect, it } from "vitest";

import { ApiError } from "@/services/api/client";
import { MAX_QUERY_RETRIES, isRetryableError, retryQuery } from "./retryPolicy";

const apiError = (status: number, code = "error") =>
  new ApiError(status, code, "failed");

describe("isRetryableError", () => {
  describe("client errors", () => {
    it("does not retry a permission denial — the failure this exists for", () => {
      expect(isRetryableError(apiError(403, "forbidden"))).toBe(false);
    });

    it("does not retry a 404, which answers the same way every time", () => {
      expect(isRetryableError(apiError(404, "not_found"))).toBe(false);
    });

    it("does not retry a 400 or a 409 — the request or the data decides those", () => {
      expect(isRetryableError(apiError(400, "bad_request"))).toBe(false);
      expect(isRetryableError(apiError(409, "conflict"))).toBe(false);
    });

    it("does not retry a 401: the client already refreshed once and gave up", () => {
      expect(isRetryableError(apiError(401, "unauthorized"))).toBe(false);
    });

    it("retries the two client statuses that mean 'later'", () => {
      expect(isRetryableError(apiError(408))).toBe(true);
      expect(isRetryableError(apiError(429, "too_many_requests"))).toBe(true);
    });
  });

  describe("server errors", () => {
    it("retries every 5xx", () => {
      expect(isRetryableError(apiError(500, "internal"))).toBe(true);
      expect(isRetryableError(apiError(502))).toBe(true);
      expect(isRetryableError(apiError(503))).toBe(true);
    });
  });

  describe("errors with no status at all", () => {
    it("retries a bare network throw", () => {
      expect(isRetryableError(new TypeError("Failed to fetch"))).toBe(true);
    });

    it("retries anything unrecognised rather than giving up on one blip", () => {
      expect(isRetryableError({})).toBe(true);
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError("boom")).toBe(true);
    });
  });
});

describe("retryQuery", () => {
  it("stops at MAX_QUERY_RETRIES even for a retryable failure", () => {
    expect(retryQuery(MAX_QUERY_RETRIES - 1, apiError(500))).toBe(true);
    expect(retryQuery(MAX_QUERY_RETRIES, apiError(500))).toBe(false);
  });

  it("never retries a failure that will repeat, however early", () => {
    expect(retryQuery(0, apiError(403, "forbidden"))).toBe(false);
  });
});
