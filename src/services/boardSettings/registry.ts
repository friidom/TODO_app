// Board Settings declared as values, the shape services/views/registry.ts and
// services/admin/registry.ts already use. The nav renders this list and a test
// pins it, so a section cannot be added to one and forgotten in the other.
//
// Only sections that do something are listed. A greyed-out "Work types" would
// be a promise the page cannot keep.

export const BOARD_SETTINGS_SECTIONS = ["details", "features"] as const;

export type BoardSettingsSection = (typeof BOARD_SETTINGS_SECTIONS)[number];

export interface BoardSettingsSectionDefinition {
  section: BoardSettingsSection;
  label: string;
  hint: string;
}

export const BOARD_SETTINGS_SECTION_DEFINITIONS: Record<
  BoardSettingsSection,
  BoardSettingsSectionDefinition
> = {
  details: {
    section: "details",
    label: "Details",
    hint: "Name, key and where this board is filed.",
  },
  features: {
    section: "features",
    label: "Features",
    hint: "Turn parts of the board on and off.",
  },
};

export function boardSettingsSections(): BoardSettingsSectionDefinition[] {
  return BOARD_SETTINGS_SECTIONS.map(
    (section) => BOARD_SETTINGS_SECTION_DEFINITIONS[section],
  );
}

// Built here rather than spelled out at each call site, so the route and the
// nav cannot disagree about where a section lives.
export function boardSettingsPath(
  boardId: string,
  section: BoardSettingsSection,
): string {
  return `/boards/${boardId}/settings/${section}`;
}

export function isBoardSettingsSection(
  value: unknown,
): value is BoardSettingsSection {
  return (
    typeof value === "string" &&
    (BOARD_SETTINGS_SECTIONS as readonly string[]).includes(value)
  );
}
