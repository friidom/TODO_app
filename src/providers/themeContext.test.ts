import { afterEach, describe, expect, it, vi } from "vitest";

import { THEME_KEY, readTheme, saveTheme } from "./themeContext";

function stubStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));

  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });

  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readTheme", () => {
  it("is light for a first visit", () => {
    stubStorage();

    expect(readTheme()).toBe("light");
  });

  it("ignores the old key, which held the old dark default for everyone", () => {
    stubStorage({ theme: "dark" });

    expect(readTheme()).toBe("light");
  });

  it("keeps a saved choice", () => {
    stubStorage({ [THEME_KEY]: "dark" });
    expect(readTheme()).toBe("dark");

    stubStorage({ [THEME_KEY]: "light" });
    expect(readTheme()).toBe("light");
  });

  it("falls back to light for a junk value", () => {
    stubStorage({ [THEME_KEY]: "purple" });

    expect(readTheme()).toBe("light");
  });

  it("falls back to light when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });

    expect(readTheme()).toBe("light");
  });
});

describe("saveTheme", () => {
  it("round-trips a switch both ways", () => {
    const store = stubStorage();

    saveTheme("dark");
    expect(store.get(THEME_KEY)).toBe("dark");
    expect(readTheme()).toBe("dark");

    saveTheme("light");
    expect(readTheme()).toBe("light");
  });

  it("does not throw when storage does", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });

    expect(() => saveTheme("dark")).not.toThrow();
  });
});
