import { StarIcon } from "lucide-react";

import { workTypeOf } from "@/constants/workTypes";
import type { FeedItem } from "@/services/forYou/feed";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

/**
 * One line of the personal feed (M21).
 *
 * **A link-shaped button, not a card.** The reference is a dense list you scan
 * top to bottom, so the row's job is to be quiet: no border, no surface of its
 * own, one hover tint. Bordering each row would turn twenty rows into twenty
 * boxes and put more pixels into the gaps than into the titles.
 *
 * The metadata line is `Task · KAN-4 · My Board`, in that order, because it
 * reads outward — what kind of thing, which thing, where it lives — and each
 * part is dropped rather than blanked when it is missing. `board_key` is null
 * for the moment a card is in flight, so the key genuinely can be absent.
 *
 * **The avatar is only rendered when the person can be named.** `profiles` RLS
 * is self-only and the roster is fetched per board, so a cross-board feed
 * cannot resolve arbitrary assignees without one RPC per board — which is the
 * request-per-board pattern this page exists to avoid. What it *can* say for
 * certain is "this one is yours", and that is what the avatar means here.
 */
export default function FeedRow({
  item,
  now,
  isMine,
  avatarUrl,
  initial,
  starred,
  onOpen,
  onToggleStar,
}: {
  item: FeedItem;
  /** Passed down so every row in a render agrees on what "now" is. */
  now: number;
  /** The current user is the assignee — the only person this page can name. */
  isMine: boolean;
  avatarUrl?: string | null;
  /** First letter of the current user's name, for the avatar fallback. */
  initial: string;
  /** Null while the star state is unknown, which hides the control. */
  starred: boolean | null;
  onOpen: () => void;
  onToggleStar?: () => void;
}) {
  const { todo } = item;

  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const meta = [todo.type, item.key, item.boardName].filter(Boolean);

  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "hover:bg-ink/[0.04] focus-visible:ring-brand flex w-full items-center gap-3 rounded-lg py-2 pl-2 text-left transition-colors duration-150 outline-none focus-visible:ring-2 sm:pl-3",
          // Room for the star, reserved whether or not one is offered. Sizing
          // the gap on hover instead would slide the timestamp sideways under
          // the pointer — and reserving it unconditionally keeps every row's
          // right edge on the same line, starred or not.
          onToggleStar ? "pr-10" : "pr-2 sm:pr-3",
        )}
      >
        {/* The type, as a tinted square rather than a bare icon. Same `chip`
            token the compact card uses, so a Bug reads identically here and on
            a board — M17's continuity rule. */}
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            type.chip,
          )}
        >
          <TypeIcon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[13.5px] font-medium">
            {todo.title || <span className="text-ink-3/70">Untitled</span>}
          </span>

          {/* Interpuncts between parts rather than around them, so a missing
              key does not leave a dangling separator. */}
          <span className="text-ink-3 mt-0.5 block truncate text-[11.5px]">
            {meta.join(" · ")}
          </span>
        </span>

        {/* The right rail. `hidden sm:flex` on the avatar rather than on the
            whole rail: the timestamp is the one thing a narrow screen still
            needs, because it is what the group header is already sorting by. */}
        <span className="flex shrink-0 items-center gap-2.5">
          {isMine &&
            (avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="hidden size-6 rounded-full object-cover sm:block"
              />
            ) : (
              <span className="bg-brand-soft text-brand hidden size-6 place-items-center rounded-full text-[10px] font-semibold sm:grid">
                {initial}
              </span>
            ))}

          <span className="text-ink-3 text-[11.5px] tabular-nums">
            {relativeTime(item.at, now)}
          </span>
        </span>
      </button>

      {/* THE STAR. Outside the button, because a button inside a button is
          invalid HTML and the browser's own repair of it drops one of them.
          Absolutely positioned over the row's right edge and revealed on hover,
          so an idle feed is titles rather than a column of grey stars — and it
          stays visible once starred, since that is state rather than an
          affordance. */}
      {starred !== null && onToggleStar && (
        <button
          type="button"
          onClick={onToggleStar}
          aria-label={starred ? "Remove star" : "Star this work item"}
          aria-pressed={starred}
          className={cn(
            "focus-visible:ring-brand absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-all duration-150 outline-none focus-visible:opacity-100 focus-visible:ring-2",
            "hover:bg-ink/[0.06]",
            starred
              ? "text-status-orange opacity-100"
              : "text-ink-3 opacity-0 group-hover/row:opacity-100 hover:opacity-100",
          )}
        >
          <StarIcon
            className={cn("size-4", starred && "fill-current")}
            strokeWidth={2}
          />
        </button>
      )}
    </li>
  );
}
