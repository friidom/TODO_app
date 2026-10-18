import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  refreshSession: vi.fn<() => Promise<boolean>>(),
  takeRefreshedUser: vi.fn<() => unknown>(),
  get: vi.fn<(path: string) => Promise<unknown>>(),
}));

vi.mock("../api/client", () => ({
  api: { get: client.get },
  broadcastSignOut: vi.fn(),
  refreshSession: client.refreshSession,
  setAccessToken: vi.fn(),
  takeRefreshedUser: client.takeRefreshedUser,
  toQuery: vi.fn(),
}));

const { restoreSession } = await import("./authApi");

const USER = { id: "u1", email: "a@example.com", org_role: "member" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("restoreSession", () => {
  it("is signed out, without asking /auth/me, when there is no live refresh cookie", async () => {
    client.refreshSession.mockResolvedValue(false);

    expect(await restoreSession()).toBeNull();
    expect(client.get).not.toHaveBeenCalled();
  });

  it("is signed out when the refresh request itself fails", async () => {
    client.refreshSession.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await restoreSession()).toBeNull();
  });

  it("restores a reload from the refresh response in one round trip", async () => {
    client.refreshSession.mockResolvedValue(true);
    client.takeRefreshedUser.mockReturnValue(USER);

    expect(await restoreSession()).toEqual(USER);
    expect(client.get).not.toHaveBeenCalled();
  });

  it("asks /auth/me when another tab did the refresh", async () => {
    client.refreshSession.mockResolvedValue(true);
    client.takeRefreshedUser.mockReturnValue(null);
    client.get.mockResolvedValue({ user: USER });

    expect(await restoreSession()).toEqual(USER);
    expect(client.get).toHaveBeenCalledWith("/auth/me");
  });

  it("treats a failed /auth/me as signed out rather than throwing", async () => {
    client.refreshSession.mockResolvedValue(true);
    client.takeRefreshedUser.mockReturnValue(null);
    client.get.mockRejectedValue(new Error("offline"));

    expect(await restoreSession()).toBeNull();
  });
});
