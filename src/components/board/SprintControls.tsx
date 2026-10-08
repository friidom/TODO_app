import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChartLineIcon, FlagIcon } from "lucide-react";

import CompleteSprintModal from "@/components/backlog/CompleteSprintModal";
import IconButton from "@/components/ui/IconButton";
import { TOOLBAR_DIVIDER } from "@/components/ui/controlChrome";
import { usePanel } from "@/hooks/usePanel";
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
  const { t } = useTranslation();
  const { data: sprints = [] } = useSprints();
  const { canEditTodos } = usePermissions();
  const { panel, openPanel, closePanel } = usePanel();

  const [completing, setCompleting] = useState(false);

  const sprint = activeSprintOf(sprints);

  if (!sprintsEnabled || !sprint) return null;

  const dates = sprintDates(sprint);
  const insightsOpen = panel === "insights";

  return (
    <>
      {/* only where it fits whole — squeezed any narrower it truncated to a lone initial; Sprint details has it all */}
      <p className="text-meta text-ink-3 hidden max-w-64 min-w-0 truncate @6xl:block">
        <span className="text-ink-2 font-medium">{sprint.name}</span>
        {dates && ` · ${dates}`}
      </p>

      {canEditTodos && (
        <ToolbarButton
          label={t("sprint.complete")}
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
          // filled dark like Jira's Complete sprint; the hover and active text/background must be restated or the base control's would win
          className="bg-ink text-canvas hover:bg-ink/90 hover:text-canvas active:bg-ink/80 border-transparent font-medium"
        />
      )}

      <SprintDetails sprint={sprint} />

      <IconButton
        label={t("insights.title")}
        size="toolbar"
        active={insightsOpen}
        onClick={() => (insightsOpen ? closePanel() : openPanel("insights"))}
        // bg-transparent and the idle border would cancel the active look, so they only apply when idle
        className={cn(
          "size-8 rounded-md",
          !insightsOpen && "border-ink/15 hover:bg-wash-strong bg-transparent",
        )}
      >
        <ChartLineIcon />
      </IconButton>

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
