import { LayersIcon } from "lucide-react";

import type { TimelineScale } from "@/services/views/timeline";
import type { PlacedSprint } from "@/services/views/timelineHierarchy";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { Row } from "./TimelineRow";
import { trackColumns } from "./timelineAxis";

/**
 * The Sprints band — every Sprint laid out along ONE line above the Epics,
 * with "Sprints" naming it in the rail (M31-Timeline polish).
 *
 * **One row for all of them, not one row per Sprint.** That is the shape the
 * reference draws, and it is what makes the angled ends below say anything:
 * two Sprints handing over to each other are legible as a handover only when
 * their bars actually meet. Sprints that genuinely overlap cannot share the
 * line without hiding each other, so `packSprintLanes`
 * (`timelineHierarchy.ts`) stacks those onto a second line — on the ordinary
 * board, where Sprints run back to back, the band is exactly one row tall.
 *
 * **Deliberately quieter than an Epic bar, and that is the whole point of
 * the restyle.** An Epic is work; a Sprint is the frame around it. So an
 * Epic keeps the saturated `categoryOf(...).dot` fill it has always had and
 * a Sprint reads as a neutral outlined capsule — `bg-elevated` inside a
 * hairline-weight edge, the same two tokens the rest of this view already
 * builds its chrome from. No new palette entry, and nothing here competes
 * with the bars underneath it for attention.
 *
 * **`TimelineBar` is not reused, unlike the Epic and Task rows.** That
 * component's fill *and* its progress shading are both derived from a
 * column's category — a fact a Sprint does not have and must not borrow (a
 * Sprint is not "in progress" the way a card sitting in an in_progress
 * column is). What is shared instead is everything structural: `Row`, the
 * sticky rail shape, and `trackColumns` for the grid the bars are placed in.
 */
export default function TimelineSprintBand({
  sprints,
  ticks,
  scale,
  locale,
  today,
  onOpen,
}: {
  sprints: PlacedSprint[];
  ticks: string[];
  scale: TimelineScale;
  locale?: string;
  today: string;
  onOpen: (sprintId: string) => void;
}) {
  const lanes: PlacedSprint[][] = [];

  for (const sprint of sprints) {
    (lanes[sprint.lane] ??= []).push(sprint);
  }

  return (
    // The band's own tint, which is what makes it read as a planning layer
    // rather than three more rows of work. Translucent so the axis rules and
    // the today line still show through it, exactly as they do behind a
    // normal row.
    <div className="bg-ink/[0.02] relative">
      {lanes.map((lane, index) => (
        <Row key={index}>
          <BandRail labelled={index === 0} />

          <div
            className="grid flex-1 items-center"
            style={{ gridTemplateColumns: trackColumns(ticks.length, scale) }}
          >
            {lane.map((sprint) => (
              <SprintCapsule
                key={sprint.item.sprint.id}
                sprint={sprint}
                locale={locale}
                today={today}
                onOpen={() => onOpen(sprint.item.sprint.id)}
              />
            ))}
          </div>
        </Row>
      ))}
    </div>
  );
}

/**
 * The band's rail: the word "Sprints", once, however many lanes there are.
 *
 * Opaque (`bg-surface`) rather than inheriting the band's tint, matching
 * every other rail on this axis — it has to hide the bars scrolling
 * underneath it, which a translucent background would not.
 */
function BandRail({ labelled }: { labelled: boolean }) {
  return (
    <div className="border-hairline bg-surface sticky left-0 z-10 flex w-40 shrink-0 items-center border-r px-3 md:w-60">
      {labelled && (
        <span className="text-ink-2 text-xs font-semibold">Sprints</span>
      )}
    </div>
  );
}

/**
 * The corner geometry for one capsule.
 *
 * `undefined` — no clip at all — for a Sprint that touches nothing, which is
 * the common case and keeps a plain rounded capsule plainly rounded.
 * Otherwise the touching end is cut: the earlier bar ends in a point and the
 * later one opens with the matching notch, so a handover reads as one shape
 * continuing into the next rather than as two bars that happen to abut.
 *
 * Six pixels, which is a third of the bar's height — enough to read as
 * deliberate at a glance and far short of the exaggerated chevron a larger
 * cut would give.
 */
function capsuleClip(
  angledStart: boolean,
  angledEnd: boolean,
): string | undefined {
  if (!angledStart && !angledEnd) return undefined;

  const cut = "6px";
  const points = ["0 0"];

  points.push(angledEnd ? `calc(100% - ${cut}) 0` : "100% 0");

  // The point itself, on the right edge.
  if (angledEnd) points.push("100% 50%");

  points.push(angledEnd ? `calc(100% - ${cut}) 100%` : "100% 100%");
  points.push("0 100%");

  // The notch, cut back into the left edge to receive the point above.
  if (angledStart) points.push(`${cut} 50%`);

  return `polygon(${points.join(", ")})`;
}

/**
 * One Sprint, as an outlined capsule with its own name inside it.
 *
 * **Two stacked layers rather than a `border`, because the edge has to
 * survive the clip.** `clip-path` cuts a border off along with everything
 * else outside the polygon, so an angled end drawn that way would lose its
 * outline on exactly the edge the shape exists to show. An outer element
 * filled with the edge colour, padded by a pixel, holding an inner element
 * filled with the surface colour gives an outline that follows the polygon
 * on every side — including the diagonal — because both layers are clipped
 * to the same shape.
 */
function SprintCapsule({
  sprint: placed,
  locale,
  today,
  onOpen,
}: {
  sprint: PlacedSprint;
  locale?: string;
  today: string;
  onOpen: () => void;
}) {
  const { item, place, angledStart, angledEnd } = placed;
  const { sprint } = item;

  const clip = capsuleClip(angledStart, angledEnd);
  const active = sprint.state === "active";

  const label = `${sprint.name} — ${formatDue(item.start, today, locale)} to ${formatDue(item.end, today, locale)}`;

  return (
    <div
      style={{ gridColumn: `${place.index + 1} / span ${place.span}` }}
      className="flex h-5 items-stretch px-px"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        title={label}
        style={{ clipPath: clip }}
        className={cn(
          "focus-visible:ring-brand flex h-full w-full min-w-0 cursor-pointer p-px transition-colors outline-none focus-visible:ring-2",
          // The edge layer. Neutral by default; the running Sprint gets a
          // green edge — the one colour this view already spends on "done /
          // live" — so it is identifiable without the fill ever stopping
          // being grey.
          active ? "bg-status-green/45" : "bg-ink/15 hover:bg-ink/25",
          !angledStart && "rounded-l-[4px]",
          !angledEnd && "rounded-r-[4px]",
        )}
      >
        <span
          style={{ clipPath: clip }}
          className={cn(
            "bg-elevated flex h-full w-full min-w-0 items-center gap-1 px-1.5",
            !angledStart && "rounded-l-[3px]",
            !angledEnd && "rounded-r-[3px]",
            // Keeps the name clear of the notch that has been cut out of the
            // left edge, so a handover never clips its own first letter.
            angledStart && "pl-2.5",
          )}
        >
          <LayersIcon
            className={cn(
              "size-3 shrink-0",
              active ? "text-status-green" : "text-ink-3",
            )}
          />

          <span className="text-ink-2 text-micro min-w-0 truncate font-medium">
            {sprint.name}
          </span>
        </span>
      </button>
    </div>
  );
}
