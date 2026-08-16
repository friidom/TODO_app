import type { Activity } from "@/types/data";

/**
 * What one activity entry says, as text (M18).
 *
 * **Pure, and separate from the row that renders it**, for the reason every
 * pure module here is separate: this is the part with branches. Eleven event
 * shapes, each with a payload that may be missing a field because the row was
 * written by an older trigger or because the value genuinely was null — that is
 * logic worth a test, and `activityText.test.ts` is it.
 *
 * **It reads the payload and never the database.** The trigger snapshots
 * whatever the sentence needs at write time (column titles, the old and new
 * name, the role), precisely so this function can render an entry for a card
 * that has since been deleted, in a column that no longer exists. Anything this
 * function had to look up would be a way for history to stop explaining itself
 * — which is the rule M7-05 recorded and M18's migration encodes.
 *
 * The one thing it does resolve is a **person**, through the `names` map the
 * caller builds from the roster it already has. People outlive the rows that
 * point at them, so their current name is the honest one to show; when the
 * roster no longer lists them, `names` simply misses and the fallback stands in.
 */

/** How a person is named when the roster does not list them any more. */
const FORMER = "a former member";

export type ActivityLine = {
  /**
   * The sentence, minus the actor — the row renders "Alice " and then this.
   *
   * One string rather than styled parts. The alternative was a subject/verb
   * /detail struct so the key could be a link inside the sentence, but the row
   * is a better click target than four characters inside it, so the whole line
   * is the affordance and `taskId` below is what it opens.
   */
  text: string;

  /**
   * The work item to open, or null.
   *
   * Null for column and membership entries, and also for a work item entry
   * whose card has been deleted — there is nothing to open, and a row that
   * looks clickable and resolves to "Task not found" is worse than one that
   * does not.
   */
  taskId: string | null;
};

export type ActivityContext = {
  /** `boards.key_prefix`, so an entry reads KAN-12 and not 12. */
  keyPrefix: string;
  /** Board roster, id → display name. Missing ids fall back to `FORMER`. */
  names: Record<string, string>;
  /** Ids of work items that still exist, so a dead entry is not made clickable. */
  liveTaskIds: ReadonlySet<string>;
};

/** Reads a string out of the jsonb payload, or null for anything else. */
function str(payload: Activity["payload"], key: string): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

/** Reads a number out of the jsonb payload, or null. */
function num(payload: Activity["payload"], key: string): number | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "number" ? value : null;
}

/**
 * How a work item is named in a sentence: its key when it has one, its title
 * otherwise, and a placeholder when the payload has neither.
 *
 * The key is preferred because it is short, stable and the thing people paste
 * to each other. A card deleted before the server allocated one has no key at
 * all, which is the case the title covers.
 */
function itemLabel(activity: Activity, keyPrefix: string): string {
  const boardKey = num(activity.payload, "board_key");
  const title = str(activity.payload, "title");

  if (boardKey !== null) return `${keyPrefix}-${boardKey}`;

  return title ?? "a work item";
}

function personLabel(id: string | null, names: Record<string, string>): string {
  if (id === null) return "nobody";

  return names[id] ?? FORMER;
}

export function describeActivity(
  activity: Activity,
  { keyPrefix, names, liveTaskIds }: ActivityContext,
): ActivityLine {
  const item = itemLabel(activity, keyPrefix);

  const taskId =
    activity.entity_type === "todo" &&
    activity.entity_id !== null &&
    liveTaskIds.has(activity.entity_id)
      ? activity.entity_id
      : null;

  switch (`${activity.entity_type}.${activity.action}`) {
    case "todo.created":
      return { text: `created ${item}`, taskId };

    case "todo.deleted":
      // Never clickable — the row it names is gone by definition, so `taskId`
      // would be filtered out by `liveTaskIds` anyway. Stated here too because
      // relying on that filter would be relying on a coincidence.
      return { text: `deleted ${item}`, taskId: null };

    case "todo.moved": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      // A column may have been deleted since, in which case the trigger's
      // snapshot is all there is — and if the snapshot itself was null (the
      // card had no column), the entry degrades to the shorter true sentence
      // rather than saying "from null".
      if (from && to)
        return { text: `moved ${item} from ${from} to ${to}`, taskId };
      if (to) return { text: `moved ${item} to ${to}`, taskId };

      return { text: `moved ${item}`, taskId };
    }

    case "todo.assigned": {
      const to = str(activity.payload, "to");

      if (to === null) return { text: `unassigned ${item}`, taskId };

      return { text: `assigned ${item} to ${personLabel(to, names)}`, taskId };
    }

    case "todo.retitled": {
      const to = str(activity.payload, "to");

      // The new title, not the old one: the feed is read to find out what
      // something is *now*, and the old name is in the payload for anyone who
      // opens the row.
      if (to) return { text: `renamed ${item} to “${to}”`, taskId };

      return { text: `renamed ${item}`, taskId };
    }

    case "column.created": {
      const title = str(activity.payload, "title");

      return {
        text: `created the column ${title ?? "a column"}`,
        taskId: null,
      };
    }

    case "column.deleted": {
      const title = str(activity.payload, "title");

      return {
        text: `deleted the column ${title ?? "a column"}`,
        taskId: null,
      };
    }

    case "column.renamed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      if (from && to) {
        return { text: `renamed the column ${from} to ${to}`, taskId: null };
      }

      return { text: `renamed a column`, taskId: null };
    }

    case "member.added": {
      const role = str(activity.payload, "role");
      const who = personLabel(activity.entity_id, names);

      return {
        text: role ? `added ${who} as ${role}` : `added ${who}`,
        taskId: null,
      };
    }

    case "member.removed":
      return {
        text: `removed ${personLabel(activity.entity_id, names)}`,
        taskId: null,
      };

    case "member.role_changed": {
      const to = str(activity.payload, "to");
      const who = personLabel(activity.entity_id, names);

      return {
        text: to ? `made ${who} ${to}` : `changed ${who}'s role`,
        taskId: null,
      };
    }

    default:
      // Unreachable through the CHECK constraint, and reachable anyway if a
      // later migration adds an event this build does not know about. A vague
      // true sentence beats a blank row or a thrown render.
      return { text: `changed something`, taskId: null };
  }
}
