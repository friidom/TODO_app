import { CheckIcon, LinkIcon, Link2OffIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useCardPopover } from "./useCardPopover";
import { useEpics } from "@/services/todos/useSubtasks";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { taskKey } from "@/utils/taskKey";
import { cn } from "@/utils/cn";

/**
 * The Epic a Task belongs to — a chip when set, a dashed "no epic" chip when
 * not (M28-A).
 *
 * **Compact and Jira-like, per the milestone's own instruction — not a
 * second modal.** Every other Field in this rail is a trigger plus a small
 * floating panel (`useCardPopover`, the same plumbing `StatusControl` and
 * `PriorityControl` already use), and an Epic picker is exactly that: a
 * short list of the board's Epics, one click to attach, one more to detach.
 *
 * **Controlled, like every sibling control.** It reports the chosen Epic's
 * id (or `null` to clear) through `onChange` and never writes; the caller
 * patches through the existing `useTodoPatch` → `updateTodo` path —
 * `parent_id` has been in `TodoPatch`'s allow-list since M27, so no new
 * mutation exists for this, only a new caller of the one that was already
 * there.
 *
 * **The list is exactly the board's Epics**, via `useEpics()` — not "every
 * work item", not "every top-level item". `enforce_work_item_hierarchy`
 * would refuse anything else as a Parent for a Task, so offering only what
 * would succeed is the honest version of the control, the same argument
 * `permissions.ts`'s own doc comment makes for hiding what would fail.
 *
 * **No `boardId` prop**, matching `StatusControl` rather than
 * `AssigneeControl`: this panel opens only from inside a task already open
 * on one board, `useEpics()` reads the same route the modal itself does, and
 * there is no query key here for an explicit id to disambiguate.
 */
export default function EpicParentControl({
  value: epicId,
  onChange,
}: {
  /** The current parent id -- expected to be an Epic's id, or null. */
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { epics } = useEpics();
  const keyPrefix = useKeyPrefix();

  const epic = epics.find((candidate) => candidate.id === epicId) ?? null;
  const key = epic ? taskKey(keyPrefix, epic.board_key) : null;

  const label = epic
    ? `Parent: ${key ?? epic.title ?? "an epic"}`
    : "No parent epic";

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={cn(
          "text-mini flex min-w-0 shrink items-center gap-1 rounded px-1.5 py-0.5 font-medium transition-colors",
          epic
            ? "bg-status-orange/15 text-status-orange hover:bg-status-orange/25"
            : "border-hairline text-ink-3 hover:text-ink-2 border border-dashed",
        )}
      >
        <LinkIcon className="size-3 shrink-0" />
        <span className="min-w-0 truncate">
          {epic ? (key ?? epic.title ?? "Untitled") : "None"}
        </span>
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label="Parent epic"
            className="border-hairline bg-elevated rounded-card z-50 max-h-64 w-56 overflow-y-auto border p-1 shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
          >
            <p className="text-ink-3 text-mini px-2 py-1.5 font-semibold tracking-wide uppercase">
              Epic
            </p>

            {epics.length === 0 ? (
              <p className="text-ink-3 px-2 py-3 text-xs">
                No epics on this board yet.
              </p>
            ) : (
              <ul>
                {epics.map((candidate) => {
                  const selected = candidate.id === epicId;
                  const candidateKey = taskKey(keyPrefix, candidate.board_key);

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
                          {candidateKey && (
                            <span className="text-ink-3 tabular-nums">
                              {candidateKey}{" "}
                            </span>
                          )}
                          {candidate.title || "Untitled"}
                        </span>

                        {selected && (
                          <CheckIcon className="text-brand size-4 shrink-0" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {epicId !== null && (
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
                  Remove parent
                </button>
              </>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
