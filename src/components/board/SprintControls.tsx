import { useState } from "react";
import { FlagIcon } from "lucide-react";

import CompleteSprintModal from "@/components/backlog/CompleteSprintModal";
import { TOOLBAR_DIVIDER } from "@/components/ui/controlChrome";
import { usePermissions } from "@/hooks/usePermissions";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { activeSprintOf } from "@/services/sprints/activeSprint";
import { useSprints } from "@/services/sprints/useSprints";
import type { Sprint } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDue, todayISO } from "@/utils/dueDate";
import SprintDetails from "./SprintDetails";
import ToolbarButton from "./ToolbarButton";

// No Start sprint here: with nothing running the board shows its "No active sprint" state, which already routes to
// Backlog, and starting one means choosing which.
export default function SprintControls() {
  const sprintsEnabled = useSprintsEnabled();
  const { data: sprints = [] } = useSprints();
  const { canEditTodos } = usePermissions();

  const [completing, setCompleting] = useState(false);

  const sprint = activeSprintOf(sprints);

  if (!sprintsEnabled || !sprint) return null;

  const dates = sprintDates(sprint);

  return (
    <>
      <p className="text-meta text-ink-3 hidden max-w-64 min-w-0 truncate @4xl:block">
        <span className="text-ink-2 font-medium">{sprint.name}</span>
        {dates && ` · ${dates}`}
      </p>

      {canEditTodos && (
        <ToolbarButton
          label="Complete sprint"
          collapse="hidden @3xl:inline"
          icon={<FlagIcon className="size-4 @3xl:hidden" />}
          tooltip={
            <span className="flex flex-col gap-0.5">
              <span>
                {sprint.name}
                {dates && ` · ${dates}`}
              </span>

              {sprint.goal && (
                <span className="font-normal opacity-80">{sprint.goal}</span>
              )}
            </span>
          }
          onClick={() => setCompleting(true)}
          className="text-ink font-medium"
        />
      )}

      <SprintDetails sprint={sprint} />

      <span
        aria-hidden
        className={cn(
          TOOLBAR_DIVIDER,
          "@max-md:hidden",
          !canEditTodos && "hidden @4xl:block",
        )}
      />

      {completing && (
        <CompleteSprintModal
          sprint={sprint}
          otherOpenSprints={sprints.filter(
            (other) => other.state !== "completed" && other.id !== sprint.id,
          )}
          onClose={() => setCompleting(false)}
        />
      )}
    </>
  );
}

function sprintDates(sprint: Sprint): string | null {
  if (!sprint.start_date && !sprint.end_date) return null;

  const today = todayISO();
  const start = sprint.start_date ? formatDue(sprint.start_date, today) : "?";
  const end = sprint.end_date ? formatDue(sprint.end_date, today) : "?";

  return `${start} – ${end}`;
}
