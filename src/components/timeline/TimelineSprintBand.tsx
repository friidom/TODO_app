import { LayersIcon } from "lucide-react";

import type { TimelineScale } from "@/services/views/timeline";
import type { PlacedSprint } from "@/services/views/timelineHierarchy";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { Row } from "./TimelineRow";
import { trackColumns } from "./timelineAxis";

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

function BandRail({ labelled }: { labelled: boolean }) {
  return (
    <div className="border-hairline bg-surface sticky left-0 z-10 flex w-40 shrink-0 items-center border-r px-3 md:w-60">
      {labelled && (
        <span className="text-ink-2 text-xs font-semibold">Sprints</span>
      )}
    </div>
  );
}

// undefined (no clip) for a sprint touching nothing; otherwise cuts a point/notch so handovers read as one continuous shape.
function capsuleClip(
  angledStart: boolean,
  angledEnd: boolean,
): string | undefined {
  if (!angledStart && !angledEnd) return undefined;

  const cut = "6px";
  const points = ["0 0"];

  points.push(angledEnd ? `calc(100% - ${cut}) 0` : "100% 0");

  if (angledEnd) points.push("100% 50%");

  points.push(angledEnd ? `calc(100% - ${cut}) 100%` : "100% 100%");
  points.push("0 100%");

  if (angledStart) points.push(`${cut} 50%`);

  return `polygon(${points.join(", ")})`;
}

// Two stacked layers, not a border — clip-path would cut a border off along with the outline on the angled edge.
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
