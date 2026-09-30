import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import ru from "./locales/ru.json";
import uz from "./locales/uz.json";

const PLURAL = /_(zero|one|two|few|many|other)$/;

function leaves(tree: object, trail = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? leaves(value, `${trail}${key}.`)
      : [`${trail}${key}`],
  );
}

const keysOf = (tree: object) =>
  new Set(leaves(tree).map((key) => key.replace(PLURAL, "")));

const sources = import.meta.glob<string>(
  ["../../**/*.{ts,tsx}", "!../../**/*.test.ts"],
  { query: "?raw", import: "default", eager: true },
);

// Any literal shaped like "<namespace>.<key>" for a namespace en defines, so a
// key held in a label map is checked as well as one passed straight to t().
const namespaces = Object.keys(en).filter(
  (key) => typeof en[key as keyof typeof en] === "object",
);
const USED = [
  /\bt\(\s*"([a-zA-Z]\w*\.[\w.]+)"/g,
  new RegExp(
    `(?<!case )"((?:${namespaces.join("|")})\\.[a-zA-Z][\\w.]*)"`,
    "g",
  ),
];

describe("locales", () => {
  it.each([
    ["ru", ru],
    ["uz", uz],
  ])("%s defines exactly the keys en does", (_, locale) => {
    const english = keysOf(en);
    const translated = keysOf(locale);

    expect([...english].filter((key) => !translated.has(key))).toEqual([]);
    expect([...translated].filter((key) => !english.has(key))).toEqual([]);
  });

  it("every key the code names exists in en", () => {
    const english = keysOf(en);
    const missing = new Set<string>();

    expect(Object.keys(sources).length).toBeGreaterThan(100);

    for (const [file, text] of Object.entries(sources)) {
      for (const pattern of USED) {
        for (const [, key] of text.matchAll(pattern)) {
          if (!english.has(key)) missing.add(`${file}: ${key}`);
        }
      }
    }

    expect([...missing]).toEqual([]);
  });

  it("ru plurals carry every form Russian needs", () => {
    const plurals = leaves(ru).filter((key) => key.endsWith("_one"));

    for (const one of plurals) {
      const stem = one.slice(0, -"_one".length);

      for (const form of ["few", "many", "other"]) {
        expect(leaves(ru)).toContain(`${stem}_${form}`);
      }
    }
  });
});
