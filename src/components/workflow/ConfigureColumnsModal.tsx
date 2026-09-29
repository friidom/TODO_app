import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useDndMonitor } from "@dnd-kit/core";
import {
  GripVerticalIcon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { DragChip } from "@/components/dnd/DropLine";
import ReorderContext from "@/components/dnd/ReorderContext";
import IconButton from "@/components/ui/IconButton";
import Modal from "@/components/ui/Modal";
import {
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { categoryOf } from "@/constants/columns";
import { useTodos } from "@/services/todos/useTodos";
import {
  brokenMigrations,
  columnCategoryOf,
  draftOf,
  sameWorkflow,
  statusesOfColumn,
  withMigrationsRetargeted,
  workItemCount,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowModel } from "@/services/workflow/statuses";
import {
  usePublishWorkflow,
  type WorkflowEdit,
} from "@/services/workflow/usePublishWorkflow";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";

import CreateColumnLane from "./CreateColumnLane";
import StatusLozenge from "./StatusLozenge";
import UnmappedLane from "./UnmappedLane";
import WorkflowLane from "./WorkflowLane";
import { SELECT, workItems } from "./workflowChrome";
import { columnOfLane, withReorderMove } from "./workflowMove";

const TITLE = "Configure columns";
const WIDTH = "w-[min(1400px,calc(100vw-2rem))]";

export default function ConfigureColumnsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const workflow = useWorkflow();
  const todos = useTodos();

  if (workflow.data && todos.data) {
    return (
      <ConfigureColumnsDialog
        model={workflow.data}
        todos={todos.data}
        onClose={onClose}
      />
    );
  }

  const failed = workflow.isError || todos.isError;

  return (
    <Modal title={TITLE} onClose={onClose} width={WIDTH}>
      <h2 className={DIALOG_TITLE}>{TITLE}</h2>

      <p
        role={failed ? "alert" : "status"}
        className="text-ink-3 text-meta grid min-h-48 place-items-center"
      >
        {failed ? "The workflow could not be loaded." : "Loading workflow..."}
      </p>
    </Modal>
  );
}

function ConfigureColumnsDialog({
  model,
  todos,
  onClose,
}: {
  model: WorkflowModel;
  todos: Todo[];
  onClose: () => void;
}) {
  const [base, setBase] = useState(() => draftOf(model));
  const [draft, setDraft] = useState(base);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const draggingRef = useRef(false);

  const publish = usePublishWorkflow();

  const counts = useMemo(() => {
    const byStatus = new Map<string, number>();

    for (const todo of todos) {
      if (todo.status_id) {
        byStatus.set(todo.status_id, (byStatus.get(todo.status_id) ?? 0) + 1);
      }
    }

    return byStatus;
  }, [todos]);

  const storedIds = useMemo(
    () => new Set(base.statuses.map((status) => status.id)),
    [base],
  );

  const dirty = !sameWorkflow(base, draft);
  const broken = brokenMigrations(draft);
  const stale = model.version !== base.version && !publish.isPending;

  // The API refuses a status that holds work and is on no column, so the draft
  // never gets there: the edit is dropped and the reason shown.
  function edit(change: WorkflowEdit): boolean {
    const next = change(draft);

    if (!next) return false;

    const stranded = next.statuses.find(
      (status) =>
        status.column_id === null && workItemCount(next, status.id, counts) > 0,
    );

    if (stranded) {
      setBlocked(
        `“${stranded.name}” still holds work items, so it has to stay on a column. Delete it and choose where its work goes, or move the work first.`,
      );

      return false;
    }

    setBlocked(null);
    setDraft(next);

    return true;
  }

  // Escape and the backdrop. Modal hears Escape before dnd-kit does, so one
  // that cancels a drag must not also close the dialog; and an accidental one
  // must not throw away unpublished edits.
  function requestClose() {
    if (draggingRef.current) return;

    if (confirmDiscard) setConfirmDiscard(false);
    else if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function startOver() {
    const latest = draftOf(model);

    setBase(latest);
    setDraft(latest);
  }

  function handlePublish() {
    const published = draft;

    publish.mutate(
      (current) => (current.version === published.version ? published : null),
      { onSuccess: onClose },
    );
  }

  function describe(id: string): string {
    const lane = columnOfLane(id);

    if (lane && lane.columnId === null) return "Unmapped statuses";

    const column = draft.columns.find(
      (it) => it.id === (lane ? lane.columnId : id),
    );

    if (column) return `${column.title} column`;

    const status = draft.statuses.find((it) => it.id === id);

    return status ? `${status.name} status` : id;
  }

  function renderOverlay(activeId: string) {
    const column = draft.columns.find((it) => it.id === activeId);

    if (column) {
      return (
        <DragChip>
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              categoryOf(columnCategoryOf(draft, column.id)).dot,
            )}
          />

          <span className="text-mini truncate font-semibold tracking-wide uppercase">
            {column.title}
          </span>

          <span className="text-ink-3 text-mini shrink-0">
            {statusesOfColumn(draft, column.id).length}
          </span>
        </DragChip>
      );
    }

    const status = draft.statuses.find((it) => it.id === activeId);

    if (!status) return null;

    return (
      <div className="border-hairline bg-elevated shadow-e2 rounded-control flex w-56 cursor-grabbing items-start gap-1 border py-1.5 pr-2 pl-0.5">
        <GripVerticalIcon className="text-ink-3 mt-1.5 size-3.5 w-5 shrink-0" />

        <div className="min-w-0 flex-1 pt-1">
          <StatusLozenge
            name={status.name}
            category={status.category}
            hidden={status.is_hidden}
          />

          <p className="text-ink-3 text-mini mt-1">
            {workItems(workItemCount(draft, status.id, counts))}
          </p>
        </div>
      </div>
    );
  }

  return (
    <Modal title={TITLE} onClose={requestClose} width={WIDTH}>
      <div className="flex max-h-[calc(100dvh-4.5rem-2px)] flex-col">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className={DIALOG_TITLE}>{TITLE}</h2>

          <IconButton
            label="Close"
            size="md"
            tooltip={false}
            onClick={requestClose}
            className="-mt-1"
          >
            <XIcon />
          </IconButton>
        </div>

        <p className="text-ink-3 text-meta mb-3 flex items-start gap-2">
          <InfoIcon className="text-ink-3 mt-0.5 size-4 shrink-0" />

          <span>
            Unmapped statuses sit outside the board. Drag one into a column to
            show it there, or back out to take it off. A column can show several
            statuses, and columns can be dragged to reorder. Changes apply once
            you publish.
          </span>
        </p>

        {blocked && <Notice>{blocked}</Notice>}

        {stale && (
          <Notice>
            Someone published a change to this workflow while you were editing,
            so publishing this version would be refused.
            <button
              type="button"
              onClick={startOver}
              className="text-brand ml-1.5 font-medium underline-offset-2 hover:underline"
            >
              Start over from the latest
            </button>
          </Notice>
        )}

        {[...new Set(broken.map((migration) => migration.to))].map((to) => (
          <BrokenTarget
            key={to}
            to={to}
            draft={draft}
            base={base}
            counts={counts}
            edit={edit}
          />
        ))}

        <div className="-mx-2 min-h-0 flex-1 overflow-auto px-2 pb-1">
          <ReorderContext
            onReorder={(move) => edit((next) => withReorderMove(next, move))}
            renderOverlay={renderOverlay}
            describe={describe}
          >
            <DragWatch draggingRef={draggingRef} />

            <div className="flex w-max items-stretch gap-4">
              <UnmappedLane
                draft={draft}
                counts={counts}
                storedIds={storedIds}
                edit={edit}
              />

              <span
                aria-hidden
                className="bg-hairline w-px shrink-0 self-stretch"
              />

              <div className="flex items-stretch gap-3">
                {draft.columns.map((column) => (
                  <WorkflowLane
                    key={column.id}
                    column={column}
                    draft={draft}
                    counts={counts}
                    storedIds={storedIds}
                    edit={edit}
                  />
                ))}

                <CreateColumnLane draft={draft} edit={edit} />
              </div>
            </div>
          </ReorderContext>
        </div>

        {publish.error && !confirmDiscard && (
          <p role="alert" className={DIALOG_ERROR}>
            {publish.error.message}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {confirmDiscard ? (
            <>
              <p className="text-ink-2 text-meta mr-auto">
                Discard your unpublished changes?
              </p>

              <button
                type="button"
                autoFocus
                onClick={() => setConfirmDiscard(false)}
                className={DIALOG_CANCEL}
              >
                Keep editing
              </button>

              <button type="button" onClick={onClose} className={DIALOG_DANGER}>
                Discard
              </button>
            </>
          ) : (
            <>
              {broken.length > 0 && (
                <p className="text-status-red text-meta mr-auto">
                  Choose where the work above goes before publishing.
                </p>
              )}

              <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  !dirty || broken.length > 0 || stale || publish.isPending
                }
                onClick={handlePublish}
                className={DIALOG_CONFIRM}
              >
                {publish.isPending ? "Publishing..." : "Publish"}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DragWatch({ draggingRef }: { draggingRef: RefObject<boolean> }) {
  useDndMonitor({
    onDragStart: () => {
      draggingRef.current = true;
    },
    onDragEnd: () => {
      draggingRef.current = false;
    },
    onDragCancel: () => {
      draggingRef.current = false;
    },
  });

  return null;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-status-orange/40 bg-status-orange/10 text-ink-2 rounded-control text-meta mb-3 flex gap-2.5 border px-3 py-2.5 leading-relaxed"
    >
      <TriangleAlertIcon className="text-status-orange mt-0.5 size-4 shrink-0" />

      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

// Work an earlier delete sent to a status that has since been hidden or
// deleted: the API would refuse it, so it is re-pointed here or not published.
function BrokenTarget({
  to,
  draft,
  base,
  counts,
  edit,
}: {
  to: string;
  draft: WorkflowDraft;
  base: WorkflowDraft;
  counts: ReadonlyMap<string, number>;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const status = draft.statuses.find((it) => it.id === to);
  const name =
    status?.name ?? base.statuses.find((it) => it.id === to)?.name ?? null;
  const count = draft.migrations
    .filter((migration) => migration.to === to)
    .reduce((sum, migration) => sum + (counts.get(migration.from) ?? 0), 0);
  const options = draft.statuses.filter((it) => !it.is_hidden);

  return (
    <Notice>
      <span className="mb-2 block">
        {workItems(count)} from a deleted status were set to move to{" "}
        {name ? `“${name}”` : "a status"}, which{" "}
        {status ? "is now hidden" : "was deleted"}.{" "}
        {options.length
          ? "Choose where they go instead."
          : "Show or add a status for them to move to."}
      </span>

      {options.length > 0 && (
        <select
          aria-label="Move them to"
          value=""
          onChange={(e) =>
            edit((next) => withMigrationsRetargeted(next, to, e.target.value))
          }
          className={cn(SELECT, "bg-elevated max-w-64")}
        >
          <option value="" disabled>
            Move them to...
          </option>

          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )}
    </Notice>
  );
}
