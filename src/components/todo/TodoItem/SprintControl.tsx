import { CheckIcon, Link2OffIcon, LayersIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import type { Sprint } from "@/types/data";
import {
  MENU_ITEM,
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { cn } from "@/utils/cn";
import { FIELD_CHIP, FIELD_EMPTY, OPTION_ITEM } from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

// controlled — reports the chosen id via onChange and never writes itself; the caller decides what else to patch
export default function SprintControl({
  value: sprintId,
  sprints,
  onChange,
}: {
  value: string | null;
  sprints: Sprint[];
  onChange: (value: string | null) => void;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  const options = sprints.filter((sprint) => sprint.state !== "completed");
  // looked up in the full list, not options — a card can still be linked to a completed sprint and should show its name
  const sprint = sprints.find((candidate) => candidate.id === sprintId) ?? null;

  const label = sprint ? `Sprint: ${sprint.name}` : "No sprint";

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={cn(
          FIELD_CHIP,
          "min-w-0 shrink",
          sprint
            ? "bg-status-blue/15 text-status-blue hover:bg-status-blue/25"
            : FIELD_EMPTY,
        )}
      >
        <LayersIcon className="size-3 shrink-0" />
        <span className="min-w-0 truncate">
          {sprint ? sprint.name : "None"}
        </span>
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Sprint"
            className={cn(POPOVER_PANEL, "z-50 max-h-64 w-56 overflow-y-auto")}
          >
            <p className={MENU_LABEL}>Sprint</p>

            {options.length === 0 ? (
              <p className="text-ink-3 text-meta px-2 py-2">
                No open sprints on this board yet.
              </p>
            ) : (
              <ul>
                {options.map((candidate) => {
                  const selected = candidate.id === sprintId;

                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(selected ? null : candidate.id);
                          close();
                        }}
                        className={cn(OPTION_ITEM, "min-w-0")}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {candidate.name}
                        </span>

                        {candidate.state === "active" && (
                          <span className="text-status-green text-micro shrink-0 font-medium tracking-wide uppercase">
                            Active
                          </span>
                        )}

                        {selected && (
                          <CheckIcon className="text-brand size-4" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {sprintId !== null && (
              <>
                <div className={MENU_SEPARATOR} />

                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    close();
                  }}
                  className={MENU_ITEM}
                >
                  <Link2OffIcon />
                  Remove from sprint
                </button>
              </>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
