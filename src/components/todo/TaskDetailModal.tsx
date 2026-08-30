import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import ActivitySection from "./ActivitySection";
import EpicTasksSection from "./EpicTasksSection";
import ParentLine from "./ParentLine";
import SubtasksSection from "./SubtasksSection";
import AssigneeControl from "./TodoItem/AssigneeControl";
import DueDateControl from "./TodoItem/DueDateControl";
import EpicParentControl from "./TodoItem/EpicParentControl";
import EstimateControl from "./TodoItem/EstimateControl";
import PriorityControl from "./TodoItem/PriorityControl";
import SprintControl from "./TodoItem/SprintControl";
import StartDateControl from "./TodoItem/StartDateControl";
import StatusControl from "./TodoItem/StatusControl";
import WorkTypeControl from "./TodoItem/WorkTypeControl";
import { Skeleton } from "@/components/ui/skeleton";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { usePermissions } from "@/hooks/usePermissions";
import { useTodoPatch } from "@/hooks/useTodoPatch";
import {
  descriptionChanged,
  descriptionValue,
  titleValue,
} from "@/services/todos/taskDraft";
import { useTodo } from "@/services/todos/useTodo";
import { useTodoHierarchy } from "@/services/todos/useSubtasks";
import { useSprints } from "@/services/sprints/useSprints";
import type { TodoRow } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";
import { taskKey } from "@/utils/taskKey";

/** Long enough to be seen leaving, short enough not to be waited on. */
const EXIT_MS = 150;

/**
 * One work item, as a centered modal over the board.
 *
 * **It was a right-side drawer, and the drawer was the mistake.** A 22rem panel
 * permanently reserved a third of a wide screen for a surface that is open a
 * fraction of the time, squeezed the board it was supposed to keep in view, and
 * gave a work item — the thing the whole product is about — less room than the
 * column it sits in. This is the same information in a surface sized for it:
 * the board is dimmed but visible behind, and it comes back untouched on close.
 *
 * **The URL contract is unchanged.** `useOpenTask` still owns `?task=<id>`,
 * still pushes on open so Back closes it, still replaces on close. Nothing about
 * addressability, deep links or the board's mounted-behind-it property depended
 * on the *shape* of the surface — which is why the change is this small.
 *
 * **Two columns, and the split is what a work item actually looks like.** The
 * left is what someone wrote — the summary and the description. The right is
 * what the system knows: status, type, priority, assignee, due date, and when it
 * was created and last touched. Every one of those controls is the one the card
 * and the list already use, wired to the same `useTodoPatch`; the only field
 * with nowhere else to live is `description`. Below `md` the two stack, because
 * two columns in 375px is one column with extra steps.
 *
 * **No new fields.** Attachments, subtasks, links and comments are real parts of
 * the eventual surface and none of them exist yet — M7 owns comments, and the
 * rest are unbuilt. Drawing empty sections for them would be inventing
 * functionality, so the modal shows what the row holds and nothing more.
 */
export default function TaskDetailModal({ boardId }: { boardId: string }) {
  const { taskId, closeTask } = useOpenTask();

  // Held through the exit animation, so the modal can be seen leaving with the
  // task it was showing rather than blanking on the frame the param clears.
  const shown = useClosingValue(taskId, EXIT_MS);

  if (!shown) return null;

  return (
    // Keyed by task, so switching tasks remounts and the title and description
    // drafts cannot leak from one item to the next.
    <Overlay
      key={shown}
      taskId={shown}
      boardId={boardId}
      leaving={!taskId}
      onClose={closeTask}
    />
  );
}

/**
 * Keeps the last truthy value for `ms` after it goes away.
 *
 * An exit animation needs the element to outlive the state that renders it, and
 * this is the smallest way to buy that: React unmounts on the frame `?task=`
 * clears, so without it there is nothing left on screen to animate. Local rather
 * than a shared hook — one caller, and the popovers get their exit from
 * `useTransitionStyles` instead.
 */
function useClosingValue<T>(value: T | undefined, ms: number) {
  const [held, setHeld] = useState(value);

  // Adopting a new value is derived state, so it is adjusted during render —
  // React documents this shape for exactly this case, and it is what
  // `BoardSearch` and `ProfilePage` already do. In an effect it would render
  // once with the stale value and again with the fresh one, which is the
  // cascading-render antipattern `react-hooks/set-state-in-effect` exists to
  // catch.
  if (value && value !== held) setHeld(value);

  // Letting go of it is not derived state — it is a delay — so it belongs here.
  // The cleanup is what makes reopening before the timer fires safe: the clear
  // is cancelled rather than landing on the newly opened task.
  useEffect(() => {
    if (value) return;

    const id = setTimeout(() => setHeld(undefined), ms);

    return () => clearTimeout(id);
  }, [value, ms]);

  return value ?? held;
}

function Overlay({
  taskId,
  boardId,
  leaving,
  onClose,
}: {
  taskId: string;
  boardId: string;
  leaving: boolean;
  onClose: () => void;
}) {
  const { data: todo, isPending, error } = useTodo(taskId, boardId);

  /**
   * What Escape and a backdrop click do.
   *
   * A ref rather than a prop, because the answer lives two components down: only
   * `Body` knows whether a draft is unsaved, and only it can raise the
   * confirmation. The listener has to be here — it is the overlay that owns the
   * dismissal — so the overlay asks rather than decides. While the task is
   * loading or missing there is nothing to lose, so it falls back to closing.
   */
  const requestCloseRef = useRef(onClose);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      // Deferred to whatever is on top, the rule every dialog here follows: a
      // popover inside the modal handles Escape first and marks it, so the
      // status picker closes without taking the task with it.
      if (event.key === "Escape" && !event.defaultPrevented) {
        requestCloseRef.current();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  return (
    <div
      // `onMouseDown` rather than `onClick`, matching `ui/Modal`: a selection
      // that starts on the description and finishes past the edge of the panel
      // is a drag, not a dismissal.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestCloseRef.current();
      }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-6",
        // `fill-mode-forwards` on the exit is not decoration: without it the
        // animation reverts to its start state on the last frame, so the modal
        // flashes back to full opacity in the instant before it unmounts.
        leaving
          ? "animate-out fade-out-0 fill-mode-forwards duration-150"
          : "animate-in fade-in-0 duration-200",
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        className={cn(
          // 1100px is the issue-workspace width the reference sits at, and the
          // `min()` is what keeps it off the edges on a laptop. Height is capped
          // rather than fitted so a long description scrolls inside the modal
          // instead of growing it past the viewport.
          "border-hairline bg-canvas rounded-surface flex h-[min(46rem,100%)] w-[min(1100px,100%)] flex-col overflow-hidden border shadow-e3",
          leaving
            ? "animate-out fade-out-0 slide-out-to-bottom-1 fill-mode-forwards duration-150"
            : "animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
        )}
      >
        {isPending ? (
          <Loading onClose={onClose} />
        ) : error ? (
          <Dead
            onClose={onClose}
            title="Could not load this task"
            body="Something went wrong fetching it. Close this and try again."
          />
        ) : !todo ? (
          // Null covers a deleted task and one belonging to another board, and
          // deliberately does not distinguish them — `fetchTodo` scopes by
          // board, so a pasted id cannot be probed for existence from here.
          <Dead
            onClose={onClose}
            title="Task not found"
            body="This task no longer exists, or it belongs to a different board."
          />
        ) : (
          <Body todo={todo} onClose={onClose} bindCloseRef={requestCloseRef} />
        )}
      </div>
    </div>
  );
}

function Body({
  todo,
  onClose,
  bindCloseRef,
}: {
  todo: TodoRow;
  onClose: () => void;
  bindCloseRef: React.RefObject<() => void>;
}) {
  const patch = useTodoPatch(todo);
  const { canEditTodos } = usePermissions();
  const key = taskKey(useKeyPrefix(), todo.board_key);

  // Which of the hierarchy-dependent sections this panel shows (M28-A) — the
  // Subtasks table, the Epic's own Tasks table, and the Parent field are
  // mutually exclusive by construction (an Epic cannot have subtasks, a
  // genuine Subtask cannot pick an Epic), so one lookup answers all three.
  const hierarchy = useTodoHierarchy(todo);

  // M30. `useSprints` is board-scoped like `useTodos`, so this is the same
  // cache entry the Backlog view reads — no second query for one more field.
  const { data: sprints = [] } = useSprints();

  const [title, setTitle] = useState(todo.title ?? "");
  const [description, setDescription] = useState(todo.description ?? "");

  // What is on screen but not yet stored. Both fields save on blur, so this is
  // only ever true mid-edit — which is exactly when closing would lose work.
  const dirty =
    titleValue(title, todo.title) !== null ||
    descriptionChanged(description, todo.description);

  const [confirmingClose, setConfirmingClose] = useState(false);

  // No effect syncing these drafts back from the server, deliberately. `Overlay`
  // is keyed by task id, so switching tasks remounts and the initial state is
  // always this task's. The only case a sync would serve is the row changing
  // underneath an open modal — a rename from the card behind it, or another
  // client — and that is M6's to solve once for every surface rather than this
  // component's to guess at now.

  function requestClose() {
    if (dirty) {
      setConfirmingClose(true);
      return;
    }

    onClose();
  }

  // Hand the guard up to the overlay, which owns Escape and the backdrop. No
  // dependency array on purpose: `requestClose` closes over `dirty`, which
  // changes on a keystroke, so the overlay has to be re-handed it every render
  // or it would go on calling a version that thinks nothing is unsaved.
  useEffect(() => {
    bindCloseRef.current = requestClose;
  });

  function saveTitle() {
    const next = titleValue(title, todo.title);

    // Null means nothing to write — either unchanged, or blanked, which reverts
    // rather than clearing.
    if (next === null) {
      setTitle(todo.title ?? "");
      return;
    }

    patch({ title: next });
  }

  function saveDescription() {
    if (!descriptionChanged(description, todo.description)) return;

    patch({ description: descriptionValue(description) });
  }

  const created = relativeTime(todo.created_at);
  const updated = relativeTime(todo.updated_at);

  return (
    <>
      <Header keyLabel={key} onClose={requestClose} />

      {/* The split. It stacks below `md` into one scrolling column; above it the
          two scroll independently, so a long description never pushes the
          status control off the screen. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="min-w-0 flex-1 px-5 py-5 md:overflow-y-auto md:px-6">
          {/* Which task this one belongs to, when it belongs to one (M27).
              Above the title because that is what a breadcrumb is — the thing
              you were looking at before this — and because a subtask's own
              title means less without it. Renders nothing at all for a
              top-level card, which is most of them. */}
          <ParentLine parentId={todo.parent_id} boardId={todo.board_id} />

          <textarea
            value={title}
            readOnly={!canEditTodos}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            rows={1}
            aria-label="Title"
            className={cn(
              // The largest text in the product after the board's own name, and
              // an editable field that does not look like one until you reach
              // for it — a heading with an input's box around it would make the
              // summary look like a form the moment the modal opened.
              "text-ink -mx-2 mb-6 field-sizing-content w-[calc(100%+1rem)] resize-none rounded-md bg-transparent px-2 py-1 text-xl leading-snug font-semibold tracking-tight outline-none",
              canEditTodos && "hover:bg-ink/5 focus:ring-brand focus:ring-2",
            )}
          />

          <h3 className="text-ink-3 text-mini mb-2 font-semibold tracking-[0.08em] uppercase">
            Description
          </h3>

          <textarea
            value={description}
            readOnly={!canEditTodos}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            rows={12}
            placeholder={
              canEditTodos ? "Add a description…" : "No description."
            }
            className={cn(
              // `rows={12}` fills the left column on a desktop split, and on a
              // 320px phone it is ~290px — 37% of the viewport reserved for an
              // empty field, with the comments and every property below the
              // fold. Capped below `md`; `resize-y` still lets it be dragged
              // open, and `md:h-auto` gives the rows attribute back on desktop.
              "border-hairline text-ink placeholder:text-ink-3 rounded-card h-36 w-full resize-y border bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none md:h-auto",
              canEditTodos &&
                "focus:border-brand/60 focus:ring-brand/25 focus:ring-2",
            )}
          />

          {/* M7-03, folded into M25's Activity tabs. In the left column and
              below the description, because this is what someone wrote and
              what happened rather than what the system currently knows — and
              because it is the one section that grows without bound, so it
              belongs under a field of fixed height inside the column that
              already scrolls.

              Outside the `pointer-events-none` the rail carries for a viewer,
              deliberately: commenting is participation, not content, so a
              viewer's discussion controls stay live while their status picker
              does not. That is M7-01's decision, and this is the one place in
              the UI where the two rules visibly differ — `ActivitySection`
              inherits it unchanged, since only its Comments tab writes
              anything. */}
          {/* Between the description and Activity, exactly where the
              reference puts it — and only for a Task that may have children,
              whether top level or already under an Epic (M28-A). A genuine
              Subtask renders no Subtasks section at all: it is the leaf of a
              three-level hierarchy, so offering the action there would be
              offering a write `enforce_work_item_hierarchy` refuses. */}
          {hierarchy.canHaveSubtasks && <SubtasksSection todo={todo} />}

          {/* An Epic's own analogue (M28-A): its Tasks, not its Subtasks —
              an Epic never has subtasks directly, so this and the section
              above never both render for the same item. */}
          {hierarchy.isEpic && <EpicTasksSection epic={todo} />}

          <ActivitySection todoId={todo.id} boardId={todo.board_id} />
        </div>

        {/* THE DETAILS RAIL — what the system knows, as against what someone
            wrote. Tinted and ruled off rather than floating, so it reads as a
            second region of one surface instead of a card sitting on it.

            Inert for a viewer, exactly as the list row's cells are. The two
            textareas above are `readOnly`, but these five are popover triggers —
            without this a viewer could open the status menu, pick a column and
            watch the write silently fail. Every surface has to agree about what
            read-only looks like. */}
        <aside
          className={cn(
            "border-hairline bg-surface/40 shrink-0 border-t p-5 md:w-[19rem] md:overflow-y-auto md:border-t-0 md:border-l",
            !canEditTodos && "pointer-events-none",
          )}
        >
          {/* Status leads and sits outside the card, because it is the one
              property people come here to change. */}
          <div className="mb-4 flex">
            <StatusControl todoId={todo.id} columnId={todo.column_id} />
          </div>

          <div className="border-hairline rounded-card border">
            <h3 className="text-ink-3 border-hairline text-mini border-b px-3.5 py-2 font-semibold tracking-[0.08em] uppercase">
              Details
            </h3>

            <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-3 px-3.5 py-3.5">
              <Field label="Work type">
                <WorkTypeControl
                  value={todo.type}
                  onChange={(type) => patch({ type })}
                  showLabel
                />
              </Field>

              <Field label="Priority">
                <PriorityControl
                  value={todo.priority}
                  onChange={(priority) => patch({ priority })}
                  showLabel
                  // A labelled field has no row to hover, so the placeholder
                  // has to stay on screen — the field's own label is what
                  // reserves the space, and an empty one would look broken.
                  alwaysVisible
                />
              </Field>

              {/* Story points (M31-C). The same `EstimateControl` the Board
                  card and the Backlog row use — not a read-only pill with a
                  separate editor — so the three surfaces can never disagree
                  about how an estimate is entered or what counts as one.

                  `alwaysVisible` because this rail has no card to hover: the
                  control's hidden-until-hover state keys off a `group`
                  ancestor that only `TodoCard` and `BacklogRow` provide.

                  `onChange` goes through the same `patch` every other field
                  here uses, so one write updates this modal, the card, the
                  Backlog row and a sprint's Story Point totals together —
                  they all read the one `["todos", boardId]` cache entry. */}
              <Field label="Story points">
                <EstimateControl
                  value={todo.estimate}
                  onChange={(estimate) => patch({ estimate })}
                  alwaysVisible
                />
              </Field>

              <Field label="Assignee">
                <AssigneeControl
                  boardId={todo.board_id}
                  value={todo.assignee_id}
                  onChange={(assignee_id) => patch({ assignee_id })}
                  alwaysVisible
                />
              </Field>

              {/* The Epic this item belongs to (M28-A). Absent for an Epic
                  itself (never has one) and for a genuine Subtask (its
                  parent is its Task, shown as the breadcrumb above the
                  title instead — a Subtask cannot select an Epic). */}
              {hierarchy.canPickEpicParent && (
                <Field label="Parent">
                  <EpicParentControl
                    value={todo.parent_id}
                    onChange={(epicId) => patch({ parent_id: epicId })}
                  />
                </Field>
              )}

              {/* The Sprint this item is planned into (M30). Absent for a
                  genuine Subtask — it has none of its own, always inheriting
                  its parent Task's, and `enforce_work_item_hierarchy` refuses
                  the write if this control were shown anyway. Shown for an
                  Epic and for a Task alike, top-level or under an Epic:
                  Epic ──→ Sprint and Task ──→ Sprint are independent
                  relationships, by design. */}
              {!hierarchy.isGenuineSubtask && (
                <Field label="Sprint">
                  <SprintControl
                    value={todo.sprint_id}
                    sprints={sprints}
                    onChange={(sprintId) => patch({ sprint_id: sprintId })}
                  />
                </Field>
              )}

              {/* The range, and the only place either end of it is editable
                  (M20). The plan put start date here rather than on the card:
                  "every new *property* is a row added to it, not a new
                  section", and a second date on a 100px board card would be
                  the fifth control on it.

                  Each is bounded by the other, so the pair cannot be inverted
                  — `todos_date_range_check` refuses that write, and a disabled
                  day is a better answer than a constraint violation in a
                  toast. */}
              <Field label="Start date">
                <StartDateControl
                  value={todo.start_date}
                  onChange={(start_date) => patch({ start_date })}
                  notAfter={todo.due_date}
                  alwaysVisible
                />
              </Field>

              <Field label="Due date">
                <DueDateControl
                  value={todo.due_date}
                  onChange={(due_date) => patch({ due_date })}
                  notBefore={todo.start_date}
                  alwaysVisible
                />
              </Field>
            </dl>
          </div>

          {/* Two columns the row has always carried and nothing has ever shown.
              `relativeTime` is the board header's own formatter, so "2m ago"
              means the same thing in both places. */}
          {(created || updated) && (
            <p className="text-ink-3/80 text-mini mt-3 px-0.5 leading-relaxed">
              {created && <span className="block">Created {created}</span>}
              {updated && <span className="block">Updated {updated}</span>}
            </p>
          )}
        </aside>
      </div>

      {confirmingClose && (
        <div className="border-hairline bg-elevated flex flex-wrap items-center gap-3 border-t px-5 py-3">
          <p className="text-ink mr-auto text-sm">
            Close with unsaved changes? They will be lost.
          </p>

          <button
            type="button"
            onClick={() => setConfirmingClose(false)}
            className="text-ink hover:bg-ink/10 rounded-control focus-visible:ring-brand px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2"
          >
            Keep editing
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-status-red hover:bg-status-red/85 rounded-control focus-visible:ring-status-red px-3 py-1.5 text-sm font-medium text-white transition-colors outline-none focus-visible:ring-2"
          >
            Discard
          </button>
        </div>
      )}
    </>
  );
}

/**
 * The bar across the top: which item this is, and the way out.
 *
 * Compact on purpose — the reference gives its header one line and spends the
 * rest of the surface on the item. The key is the item's name; the title is not
 * repeated here because it is the first thing in the body at four times the
 * size.
 */
function Header({
  keyLabel,
  onClose,
}: {
  keyLabel: string | null;
  onClose: () => void;
}) {
  return (
    <header className="border-hairline flex h-12 shrink-0 items-center gap-2 border-b px-4 md:px-5">
      {keyLabel !== null ? (
        <span className="text-ink-3 text-xs font-semibold tabular-nums">
          {keyLabel}
        </span>
      ) : (
        // The server allocates the key, so its absence is the moment a
        // just-created card is still in flight.
        <span className="text-ink-3/50 text-xs">—</span>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label="Close task details"
        className="text-ink-3 hover:bg-ink/10 hover:text-ink focus-visible:ring-brand rounded-control coarse:size-9 ml-auto grid size-7 shrink-0 place-items-center transition-colors outline-none focus-visible:ring-2"
      >
        <X size={16} />
      </button>
    </header>
  );
}

/** One property row: its name, and the control that sets it. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-ink-3 text-xs">{label}</dt>
      <dd className="flex min-w-0 items-center">{children}</dd>
    </>
  );
}

/** The shape of the modal, before the row it is going to hold arrives. */
function Loading({ onClose }: { onClose: () => void }) {
  return (
    <>
      <Header keyLabel={null} onClose={onClose} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row" aria-busy>
        <div className="min-w-0 flex-1 space-y-4 px-5 py-5 md:px-6">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>

        <div className="border-hairline bg-surface/40 shrink-0 space-y-3 border-t p-5 md:w-[19rem] md:border-t-0 md:border-l">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    </>
  );
}

/** The modal's two dead ends: a task that cannot load, and one that is gone. */
function Dead({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <>
      <Header keyLabel={null} onClose={onClose} />

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-ink text-sm font-semibold">{title}</p>
        <p className="text-ink-3 max-w-sm text-xs leading-relaxed">{body}</p>

        <button
          type="button"
          onClick={onClose}
          className="text-brand hover:bg-brand-soft focus-visible:ring-brand rounded-control mt-2 px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
        >
          Close
        </button>
      </div>
    </>
  );
}
