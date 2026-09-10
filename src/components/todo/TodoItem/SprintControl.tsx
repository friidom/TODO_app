import { CheckIcon, Link2OffIcon, LayersIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import type { Sprint } from "@/types/data";
import { cn } from "@/utils/cn";

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
          "text-mini flex min-w-0 shrink items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
          sprint
            ? "bg-status-blue/15 text-status-blue hover:bg-status-blue/25"
            : "border-hairline text-ink-3 hover:text-ink-2 border border-dashed",
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
            className="border-hairline bg-elevated rounded-card z-50 max-h-64 w-56 overflow-y-auto border p-1 shadow-e2"
          >
            <p className="text-ink-3 text-mini px-2 py-1.5 font-semibold tracking-wide uppercase">
              Sprint
            </p>

            {options.length === 0 ? (
              <p className="text-ink-3 px-2 py-3 text-xs">
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
                        className="hover:bg-ink/10 focus-visible:bg-ink/10 rounded-control flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors outline-none"
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
                          <CheckIcon className="text-brand size-4 shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {sprintId !== null && (
              <>
                <div className="bg-hairline my-1 h-px" />

                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    close();
                  }}
                  className="text-ink-2 hover:bg-ink/10 rounded-control flex w-full items-center gap-2 px-2 py-1.5 text-sm transition-colors"
                >
                  <Link2OffIcon className="size-3.5" />
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
