export const RANK_GAP = 1024; // must match src/utils/rank.ts's RANK_GAP

export const DEFAULT_SPACE_TITLE = "My Space";
export const DEFAULT_BOARD_TITLE = "My Board";

export const DEFAULT_COLUMNS = [
  { title: "To Do", category: "todo" },
  { title: "In Progress", category: "in_progress" },
  { title: "In Review", category: "in_progress" },
  { title: "Done", category: "done" },
] as const;

export const PASSWORD_MIN_LENGTH = 10;

// argon2 reads the password as bytes; an unbounded input is free CPU for an attacker.
export const PASSWORD_MAX_BYTES = 128;

export const PASSWORD_RESET_TTL_MINUTES = 60;
