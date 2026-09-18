// RANK_GAP lives in lib/rank.ts, where rank.parity.test.ts holds it to the
// frontend's value. A copy here is the drift that test exists to prevent.

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

// Mirror the frontend's ACTIVITY_PAGE / NOTIFICATION_PAGE / FEED_PAGE. They
// cap the query, not the render: activities has no retention policy.
export const ACTIVITY_PAGE = 50;
export const NOTIFICATION_PAGE = 50;
export const FEED_PAGE = 25;

// The ceiling a client may ask for. Without one, ?limit= is an unbounded scan.
export const MAX_PAGE = 200;

// create_invite CLAMPS rather than rejects (§10.6), so a crafted century
// becomes 30 days instead of a 400. No value means "never expires".
export const INVITE_EXPIRY_MIN_DAYS = 1;
export const INVITE_EXPIRY_MAX_DAYS = 30;
export const INVITE_EXPIRY_DEFAULT_DAYS = 7;

// Below this, invitee search returns nothing rather than walking the user table.
export const INVITEE_SEARCH_MIN_CHARS = 2;
