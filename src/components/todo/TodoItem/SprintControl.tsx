import { CheckIcon, Link2OffIcon, LayersIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import type { Sprint } from "@/types/data";
import { cn } from "@/utils/cn";

/**
 * The Sprint a work item belongs to — a chip when set, a dashed "no sprint"
 * chip when not (M30). Structurally `EpicParentControl`'s twin: the same
 * `useCardPopover` plumbing, the same "compact chip plus a short floating
 * list" shape, because picking a Sprint and picking an Epic parent are the
 * same kind of choice — one of a short, board-scoped list, or none.
 *
 * **Controlled, and it does not know how the value is saved.** It reports
 * the chosen Sprint's id (or `null` to clear) through `onChange` and never
 * writes — the Task Detail panel patches `sprint_id` alone through
 * `useTodoPatch`, while the Backlog view's own "Move to" use of this same
 * control also clears `column_id` when the choice is "no sprint", enforcing
 * "Backlog items are not shown on the Board". That difference lives in each
 * caller's `onChange`, not in this component, the same way `DueDateControl`
 * does not know whether it is editing a card or a still-unsaved create form.
 *
 * **The list is exactly the board's future and active Sprints.** A
 * completed sprint's planning is over — offering it here would let a work
 * item join a sprint that already shipped, which
 * `enforce_work_item_hierarchy`'s sibling rules refuse everywhere else a
 * closed container is offered as a destination.
 *
 * **No `boardId` prop**, matching `EpicParentControl`: this panel opens only
 * from inside a task or a Backlog row already scoped to one board, and the
 * caller already holds the board's own Sprint list.
 */
export default function SprintControl({
  value: sprintId,
  sprints,
  onChange,
}: {
  /** The current sprint id, or null. */
  value: string | null;
  /** The board's own sprints — filtered to future/active by the caller, or
   * here, whichever reads more naturally at the call site. */
  sprints: Sprint[];
  onChange: (value: string | null) => void;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();

  const options = sprints.filter((sprint) => sprint.state !== "completed");
  // Looked up in the full list, not `options`: a completed sprint is no
  // longer a valid *destination*, but a card's own historical link to one
  // (`complete_sprint` leaves a finished item's `sprint_id` untouched) must
  // still render as that sprint's name rather than falling back to "None".
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
