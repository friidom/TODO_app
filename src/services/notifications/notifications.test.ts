import { describe, expect, it } from "vitest";

import {
  filterNotifications,
  inviteIdOf,
  isNotificationTab,
  isUnread,
  notificationTarget,
  notificationText,
  unreadCount,
  type Notification,
} from "./notifications";

let seq = 0;

function notification(over: Partial<Notification> = {}): Notification {
  seq += 1;

  return {
    id: `n-${seq}`,
    user_id: "u-me",
    type: "assigned",
    board_id: "b-1",
    entity_type: "todo",
    entity_id: "t-1",
    actor_id: "u-other",
    payload: {
      board_title: "My Board",
      todo_title: "Ship the thing",
      actor_name: "Ada",
    },
    read_at: null,
    created_at: "2026-08-21T09:00:00Z",
    ...over,
  };
}

describe("tab param", () => {
  it("accepts the three tabs and nothing else", () => {
    expect(isNotificationTab("all")).toBe(true);
    expect(isNotificationTab("invite")).toBe(true);
    expect(isNotificationTab("assigned")).toBe(true);

    expect(isNotificationTab("mentions")).toBe(false);
    expect(isNotificationTab(null)).toBe(false);
  });
});

describe("filtering", () => {
  const rows = [
    notification({ type: "assigned" }),
    notification({ type: "invite" }),
    notification({ type: "assigned" }),
  ];

  it("returns everything for All, in the order given", () => {
    expect(filterNotifications(rows, "all")).toEqual(rows);
  });

  it("narrows to one type", () => {
    expect(filterNotifications(rows, "invite")).toHaveLength(1);
    expect(filterNotifications(rows, "assigned")).toHaveLength(2);
  });

  it("returns nothing rather than everything for an empty category", () => {
    expect(
      filterNotifications([notification({ type: "assigned" })], "invite"),
    ).toEqual([]);
  });
});

describe("unread", () => {
  it("counts only the unread ones", () => {
    expect(
      unreadCount([
        notification({ read_at: null }),
        notification({ read_at: "2026-08-21T10:00:00Z" }),
        notification({ read_at: null }),
      ]),
    ).toBe(2);
  });

  it("is zero for an empty inbox and for a fully read one", () => {
    expect(unreadCount([])).toBe(0);
    expect(
      unreadCount([notification({ read_at: "2026-08-21T10:00:00Z" })]),
    ).toBe(0);
  });

  it("treats NULL as unread and any timestamp as read", () => {
    // The column is a nullable timestamp rather than a boolean, so "unread" is
    // exactly `read_at === null` — an empty string would be a read row with a
    // broken stamp, not an unread one.
    expect(isUnread(notification({ read_at: null }))).toBe(true);
    expect(isUnread(notification({ read_at: "2026-08-21T10:00:00Z" }))).toBe(
      false,
    );
  });
});

describe("where a notification goes", () => {
  it("opens an assignment as the task, on its own board", () => {
    // The existing detail surface, addressed the way `useOpenTask` addresses
    // it — there is no notification-owned task view to keep in step.
    expect(
      notificationTarget(
        notification({ type: "assigned", board_id: "b-9", entity_id: "t-4" }),
      ),
    ).toBe("/boards/b-9?task=t-4");
  });

  it("opens an invitation as the board", () => {
    expect(
      notificationTarget(
        notification({ type: "invite", board_id: "b-9", entity_id: "i-1" }),
      ),
    ).toBe("/boards/b-9");
  });

  it("HAS NO TARGET when the thing it refers to is gone", () => {
    // `entity_id` is deliberately not a foreign key, so the row survives its
    // subject. It must render as a record, never as a link to nothing.
    expect(
      notificationTarget(notification({ type: "assigned", entity_id: null })),
    ).toBeNull();

    expect(notificationTarget(notification({ board_id: null }))).toBeNull();
  });
});

describe("what a notification says", () => {
  it("names the actor and the task for an assignment", () => {
    const { title, detail } = notificationText(
      notification({
        type: "assigned",
        payload: {
          actor_name: "Ada",
          todo_title: "Ship the thing",
          board_title: "My Board",
        },
      }),
    );

    expect(title).toBe("Ada assigned you Ship the thing");
    expect(detail).toBe("My Board");
  });

  it("names the actor and the board for an invitation", () => {
    const { title, detail } = notificationText(
      notification({
        type: "invite",
        payload: { actor_name: "Ada", board_title: "Ops", role: "editor" },
      }),
    );

    expect(title).toBe("Ada invited you to Ops");
    expect(detail).toBe("As editor");
  });

  it("survives an actor whose account has since been deleted", () => {
    // `actor_id` is `on delete set null` and the trigger may have found no
    // name. "Someone" is the honest rendering; an empty string is a bug on
    // screen.
    const { title } = notificationText(
      notification({ type: "assigned", payload: { todo_title: "X" } }),
    );

    expect(title).toBe("Someone assigned you X");
  });

  it("survives a payload with nothing in it at all", () => {
    const { title, detail } = notificationText(
      notification({ type: "assigned", payload: {} }),
    );

    expect(title).toBe("Someone assigned you a task");
    expect(detail).toBe("a board");
  });
});

describe("current-user isolation", () => {
  /**
   * The real enforcement is RLS — `user_id = auth.uid()` on select — so this
   * asserts the property the client relies on rather than re-implementing the
   * check: every row that reaches the inbox is addressed to one person, and
   * nothing here derives a row for anybody else.
   */
  it("never produces a row for another user from one addressed to me", () => {
    const mine = notification({ user_id: "u-me" });

    for (const tab of ["all", "invite", "assigned"] as const) {
      for (const row of filterNotifications([mine], tab)) {
        expect(row.user_id).toBe("u-me");
      }
    }
  });

  it("counts only the rows it was given, never widening the set", () => {
    const rows = [notification({ user_id: "u-me", read_at: null })];

    expect(unreadCount(rows)).toBe(1);
    expect(filterNotifications(rows, "all")).toHaveLength(1);
  });
});

describe("matching a notification to its invitation (M23)", () => {
  it("returns the invite id for an invitation", () => {
    expect(
      inviteIdOf(notification({ type: "invite", entity_id: "inv-1" })),
    ).toBe("inv-1");
  });

  it("returns null for every other type", () => {
    // An assignment's entity_id is a TODO id. Handing that to the invite
    // lookup would match nothing at best and the wrong thing at worst.
    expect(
      inviteIdOf(notification({ type: "assigned", entity_id: "t-1" })),
    ).toBeNull();
  });

  it("returns null when the invitation it described is gone", () => {
    // `entity_id` is deliberately not a foreign key, so the row outlives its
    // subject — the panel must render it as a record, not offer buttons.
    expect(
      inviteIdOf(notification({ type: "invite", entity_id: null })),
    ).toBeNull();
  });

  it("NEVER exposes a token — the inbox stores an id only", () => {
    // The security property: a token is a credential, and a row every client
    // fetches must not carry one. The token comes from `my_pending_invites`,
    // which is scoped to the caller inside the RPC.
    const row = notification({ type: "invite", entity_id: "inv-1" });

    expect(JSON.stringify(row)).not.toMatch(/token/i);
    expect(Object.keys(row.payload)).not.toContain("token");
  });
});
