import { describe, expect, it } from "vitest";

import {
  BOARD_SETTINGS_SECTIONS,
  BOARD_SETTINGS_SECTION_DEFINITIONS,
  boardSettingsPath,
  boardSettingsSections,
  isBoardSettingsSection,
} from "./registry";

const BOARD = "11111111-1111-4111-8111-111111111111";

describe("board settings registry", () => {
  // Pinned so a section added to the nav without a route, or the reverse,
  // fails here instead of rendering a dead link.
  it("declares exactly the sections that are implemented", () => {
    expect([...BOARD_SETTINGS_SECTIONS]).toEqual(["details", "features"]);
  });

  it("has a definition for every section, keyed by itself", () => {
    for (const section of BOARD_SETTINGS_SECTIONS) {
      const definition = BOARD_SETTINGS_SECTION_DEFINITIONS[section];

      expect(definition.section).toBe(section);
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.hint.length).toBeGreaterThan(0);
    }
  });

  it("lists them in declaration order", () => {
    expect(boardSettingsSections().map((s) => s.section)).toEqual([
      ...BOARD_SETTINGS_SECTIONS,
    ]);
  });

  it("builds a path under the board, keeping the :boardId param name", () => {
    expect(boardSettingsPath(BOARD, "features")).toBe(
      `/boards/${BOARD}/settings/features`,
    );
  });

  it("recognises only the declared sections", () => {
    expect(isBoardSettingsSection("details")).toBe(true);
    expect(isBoardSettingsSection("access")).toBe(false);
    expect(isBoardSettingsSection(null)).toBe(false);
  });
});
