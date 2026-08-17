import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";

/** How many faces before the rest become a count. Fewer than the roster's. */
const SHOWN = 3;

/**
 * Who is looking at this board right now (M6-11).
 *
 * **Separate from `MemberStack`, and the distinction is the point.** That one
 * answers "who can see this board" — a stable fact read from `board_roster`.
 * This one answers "who is here at this moment", which is presence state on the
 * channel and exists nowhere else: no table, no query key, no row to clean up
 * after a crashed tab.
 *
 * **It shows everyone connected, including you.** Leaving the viewer out was the
 * first version's mistake: with two people on a board each saw exactly one
 * avatar, so both clients looked broken while both were working. Your own face
 * is what makes the roster checkable — you can see that you are counted.
 *
 * Names and faces come from the board roster, because presence carries identity
 * and nothing else — a user id and a timestamp. **A viewer the roster does not
 * know is still drawn**, as an anonymous disc: they are connected, so the count
 * has to include them, and a roster fetched a minute ago is not a reason to tell
 * you fewer people are here than there are.
 *
 * Renders nothing only when the channel reports nobody at all — before the first
 * `sync` lands, and after the board unmounts.
 */
export default function PresenceStack({ viewers }: { viewers: string[] }) {
  const boardId = useBoardId();
  const { data: members = [] } = useBoardMembers(boardId);

  if (viewers.length === 0) return null;

  // The order is presence's, which is stable; the roster only supplies faces.
  const present = viewers.map((id) => ({
    id,
    member: members.find((member) => member.id === id),
  }));

  const shown = present.slice(0, SHOWN);
  const rest = present.length - shown.length;

  const names = present
    .map(({ member }) => (member ? memberName(member) : "Someone"))
    .join(", ");

  return (
    <div
      // Not a button: there is nothing behind it. The roster beside it opens
      // the members drawer, and a second control that opened the same drawer
      // would be two ways to reach one panel from twelve pixels apart.
      title={`${names} ${present.length === 1 ? "is" : "are"} on this board now`}
      aria-label={`${present.length} ${present.length === 1 ? "person" : "people"} on this board now`}
      className="border-hairline bg-surface rounded-control flex items-center gap-1.5 border py-1 pr-2 pl-1.5"
    >
      {/* The live dot. `status-green` because it is the product's "this is
          fine / this is on" colour, at the smallest size anything is drawn
          here — no pulse animation: a blinking dot in the board header is
          motion in the corner of the eye for as long as the tab is open. */}
      <span className="bg-status-green size-1.5 shrink-0 rounded-full" />

      <div className="flex items-center -space-x-2">
        {shown.map(({ id, member }) => (
          <Avatar key={id} size="sm" className="ring-surface shrink-0 ring-2">
            <AvatarImage src={member?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-elevated text-ink-2 text-[10px] font-semibold">
              {/* A dash rather than a letter for someone the roster has not
                  caught up with: an initial invented from a uuid would be a
                  guess wearing the same shape as a fact. */}
              {member ? memberInitial(member) : "–"}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>

      {rest > 0 && (
        <span className="text-ink-3 text-[11px] font-medium tabular-nums">
          +{rest}
        </span>
      )}
    </div>
  );
}
