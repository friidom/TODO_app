import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Client = typeof import("./client");

const fetchMock = vi.fn<typeof fetch>();
let client: Client;
let sessionEnded: ReturnType<typeof vi.fn<() => void>>;

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isRefresh(input: unknown): boolean {
  return String(input).endsWith("/auth/refresh");
}

function refreshCalls(): number {
  return fetchMock.mock.calls.filter(([input]) => isRefresh(input)).length;
}

// Every API call answers 401 for the stale token and 200 for "fresh".
function routeWith(refresh: () => Promise<Response>) {
  fetchMock.mockImplementation((input, init) => {
    if (isRefresh(input)) return refresh();

    const auth = (init?.headers as Record<string, string> | undefined)?.authorization;

    return Promise.resolve(auth === "Bearer fresh" ? json(200, { ok: true }) : json(401));
  });
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  client = await import("./client");
  sessionEnded = vi.fn<() => void>();
  client.setSessionEndedHandler(sessionEnded);
  client.setAccessToken("stale");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a 401 and the refresh that follows it", () => {
  it("retries with the refreshed token", async () => {
    routeWith(async () => json(200, { accessToken: "fresh" }));

    await expect(client.api.get("/boards")).resolves.toEqual({ ok: true });
    expect(client.getAccessToken()).toBe("fresh");
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it("ends the session when the refresh is rejected", async () => {
    routeWith(async () => json(401));

    await expect(client.api.get("/boards")).rejects.toMatchObject({ status: 401 });
    expect(sessionEnded).toHaveBeenCalledOnce();
    expect(client.getAccessToken()).toBeNull();
  });

  it.each([429, 502, 503])("keeps the session when the refresh answers %i", async (status) => {
    routeWith(async () => json(status));

    await expect(client.api.get("/boards")).rejects.toMatchObject({ status });
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(client.getAccessToken()).toBe("stale");
  });

  it("keeps the session when the refresh never reaches the server", async () => {
    routeWith(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(client.api.get("/boards")).rejects.toThrow("Failed to fetch");
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it("spends one refresh for concurrent 401s", async () => {
    routeWith(async () => json(200, { accessToken: "fresh" }));

    await Promise.all([client.api.get("/a"), client.api.get("/b"), client.api.get("/c")]);

    expect(refreshCalls()).toBe(1);
  });
});
