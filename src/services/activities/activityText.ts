import { PRIORITIES, type Priority } from "@/constants/priorities";
import type { Activity } from "@/types/data";
import { formatDue } from "@/utils/dueDate";

/**
 * What one activity entry says, as text (M18).
 *
 * **Pure, and separate from the row that renders it**, for the reason every
 * pure module here is separate: this is the part with branches. Fourteen event
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

/**
 * The value a change landed on, rendered as a chip under the sentence.
 *
 * **This is the half of an entry people actually scan for.** "Kamoliddin
 * changed KAN-23" answers nothing on its own; "Status → In Progress" is the
 * information, and burying it in a sentence means reading twelve of them to
 * find the one that matters. The sentence stays prose, the outcome becomes a
 * chip, and the eye can run down the chips alone.
 *
 * Only changes that *land somewhere* carry one. Creating, deleting and renaming
 * have no destination value — the sentence already is the whole event — so they
 * leave this null rather than repeating themselves in a box.
 */
export type ActivityDetail = {
  /** What changed: "Status", "Priority", "Due", "Assignee", "Type". */
  label: string;
  /** What it became. "None" where the change was a clearing. */
  value: string;
  /**
   * A whole Tailwind text-colour literal, or undefined for the default ink.
   *
   * Whole strings only — Tailwind scans source text, so a composed
   * `text-${token}` emits no CSS and the chip renders uncoloured. The same rule
   * `constants/priorities.ts` and `constants/workTypes.ts` state.
   */
  tone?: string;
};

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

  /** The outcome, as a chip, or null when the event has no destination value. */
  detail: ActivityDetail | null;
};

export type ActivityContext = {
  /** `boards.key_prefix`, so an entry reads KAN-12 and not 12. */
  keyPrefix: string;
  /** Board roster, id → display name. Missing ids fall back to `FORMER`. */
  names: Record<string, string>;
  /** Ids of work items that still exist, so a dead entry is not made clickable. */
  liveTaskIds: ReadonlySet<string>;
};

/**
 * Reads a string out of the jsonb payload, or null for anything else.
 *
 * **Exported (M25).** `historyText.ts` reads the same payloads for the
 * per-item History tab and needs the identical typed access — two readers
 * agreeing on one function rather than on the shape of `Activity["payload"]`
 * twice.
 */
export function str(payload: Activity["payload"], key: string): string | null {
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

/** Reads a number out of the jsonb payload, or null. Exported for the same
 * reason `str` is. */
export function num(payload: Activity["payload"], key: string): number | null {
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

/**
 * A stored priority as the product spells it, with its own colour.
 *
 * Through `PRIORITIES` rather than a local map: that object is what the sort,
 * the group, the filter and the card chip already read, so a feed entry cannot
 * call `highest` anything the rest of the product does not. A value the build
 * does not recognise falls through as itself instead of being dropped — a row
 * written by a later migration still says something true.
 */
function priorityDetail(value: string | null): ActivityDetail {
  if (value === null) return { label: "Priority", value: "None" };

  const meta = PRIORITIES[value as Priority];

  return {
    label: "Priority",
    value: meta?.label ?? value,
    tone: meta?.tone,
  };
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
      return { text: `created ${item}`, taskId, detail: null };

    case "todo.deleted":
      // Never clickable — the row it names is gone by definition, so `taskId`
      // would be filtered out by `liveTaskIds` anyway. Stated here too because
      // relying on that filter would be relying on a coincidence.
      return { text: `deleted ${item}`, taskId: null, detail: null };

    case "todo.moved": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      // Status is the destination column, so the chip is the one field where
      // the sentence and the detail overlap — and the chip still earns its
      // place, because "→ In Progress" is what someone scanning the feed reads
      // and "moved KAN-3 from Todo to In Progress" is what they read second.
      //
      // Deliberately not coloured by the column's category: the palette lives
      // in `constants/columns.ts` keyed by category, and the trigger snapshots
      // the column's TITLE rather than its id precisely because the column may
      // be gone. Looking a colour up from a title would be guessing.
      const detail: ActivityDetail | null = to
        ? { label: "Status", value: to }
        : null;

      // A column may have been deleted since, in which case the trigger's
      // snapshot is all there is — and if the snapshot itself was null (the
      // card had no column), the entry degrades to the shorter true sentence
      // rather than saying "from null".
      if (from && to)
        return { text: `moved ${item} from ${from} to ${to}`, taskId, detail };
      if (to) return { text: `moved ${item} to ${to}`, taskId, detail };

      return { text: `moved ${item}`, taskId, detail: null };
    }

    case "todo.assigned": {
      const to = str(activity.payload, "to");

      if (to === null) {
        return {
          text: `unassigned ${item}`,
          taskId,
          detail: { label: "Assignee", value: "Unassigned" },
        };
      }

      const who = personLabel(to, names);

      return {
        text: `assigned ${item} to ${who}`,
        taskId,
        detail: { label: "Assignee", value: who },
      };
    }

    case "todo.retitled": {
      const to = str(activity.payload, "to");

      // The new title, not the old one: the feed is read to find out what
      // something is *now*, and the old name is in the payload for anyone who
      // opens the row.
      if (to)
        return { text: `renamed ${item} to “${to}”`, taskId, detail: null };

      return { text: `renamed ${item}`, taskId, detail: null };
    }

    case "todo.priority_changed": {
      const to = str(activity.payload, "to");

      return {
        text: `changed the priority of ${item}`,
        taskId,
        detail: priorityDetail(to),
      };
    }

    case "todo.due_changed": {
      const to = str(activity.payload, "to");

      // Through `formatDue`, which is the one place that turns a stored value
      // into a day — the same call the card chip and the list row make. A
      // second date format here would be a second answer to what "Aug 12"
      // means, and the trigger already stored the calendar day in UTC so the
      // two agree.
      return {
        text: to ? `rescheduled ${item}` : `cleared the due date on ${item}`,
        taskId,
        detail: { label: "Due", value: to ? formatDue(to) : "None" },
      };
    }

    case "todo.type_changed": {
      const to = str(activity.payload, "to");

      return {
        text: `changed the type of ${item}`,
        taskId,
        // Uncoloured on purpose. `WORK_TYPES` has a tone per type, but a chip
        // that is red for Bug beside a red Highest priority chip would read as
        // one severity signal in two places.
        detail: to ? { label: "Type", value: to } : null,
      };
    }

    case "todo.description_changed":
      // No detail chip and no old/new value at all — the migration's header
      // records why: description is unbounded free text with no compact chip
      // to render a diff in, so the payload only ever carries `title` and
      // `board_key`, which is why this case reads neither `from` nor `to`.
      return {
        text: `changed the description of ${item}`,
        taskId,
        detail: null,
      };

    case "todo.estimate_changed": {
      const to = num(activity.payload, "to");

      return {
        text: `changed the estimate of ${item}`,
        taskId,
        detail: { label: "Estimate", value: to === null ? "None" : String(to) },
      };
    }

    case "column.created": {
      const title = str(activity.payload, "title");

      return {
        text: `created the column ${title ?? "a column"}`,
        taskId: null,
        detail: null,
      };
    }

    case "column.deleted": {
      const title = str(activity.payload, "title");

      return {
        text: `deleted the column ${title ?? "a column"}`,
        taskId: null,
        detail: null,
      };
    }

    case "column.renamed": {
      const from = str(activity.payload, "from");
      const to = str(activity.payload, "to");

      if (from && to) {
        return {
          text: `renamed the column ${from} to ${to}`,
          taskId: null,
          detail: null,
        };
      }

      return { text: `renamed a column`, taskId: null, detail: null };
    }

    case "member.added": {
      const role = str(activity.payload, "role");
      const who = personLabel(activity.entity_id, names);

      return {
        text: role ? `added ${who} as ${role}` : `added ${who}`,
        taskId: null,
        detail: null,
      };
    }

    case "member.removed":
      return {
        text: `removed ${personLabel(activity.entity_id, names)}`,
        taskId: null,
        detail: null,
      };

    case "member.role_changed": {
      const to = str(activity.payload, "to");
      const who = personLabel(activity.entity_id, names);

      return {
        text: to ? `made ${who} ${to}` : `changed ${who}'s role`,
        taskId: null,
        detail: to ? { label: "Role", value: to } : null,
      };
    }

    default:
      // Unreachable through the CHECK constraint, and reachable anyway if a
      // later migration adds an event this build does not know about. A vague
      // true sentence beats a blank row or a thrown render.
      return { text: `changed something`, taskId: null, detail: null };
  }
}
