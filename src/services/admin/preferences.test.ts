import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PERIOD } from "./periods";
import { readDefaultPeriod, writeDefaultPeriod } from "./preferences";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

beforeEach(() => store.clear());

describe("the remembered reporting period", () => {
  it("falls back to the milestone default when nothing was chosen", () => {
    expect(readDefaultPeriod()).toBe(DEFAULT_PERIOD);
  });

  it("remembers a choice", () => {
    writeDefaultPeriod("quarter");

    expect(readDefaultPeriod()).toBe("quarter");
  });

  // Storing the default would pin it, so a later change to what the app
  // opens on would not reach anyone who had never touched the setting.
  it("stores nothing when the choice is the default", () => {
    writeDefaultPeriod("quarter");
    writeDefaultPeriod(DEFAULT_PERIOD);

    expect(store.size).toBe(0);
    expect(readDefaultPeriod()).toBe(DEFAULT_PERIOD);
  });

  it("ignores a stored value the server would refuse", () => {
    store.set("admin:default-period", "90d");

    expect(readDefaultPeriod()).toBe(DEFAULT_PERIOD);
  });

  // localStorage throws rather than returning null in a private window with
  // site data blocked, and an admin screen must still render.
  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readDefaultPeriod()).toBe(DEFAULT_PERIOD);
    expect(() => writeDefaultPeriod("year")).not.toThrow();
  });
});
