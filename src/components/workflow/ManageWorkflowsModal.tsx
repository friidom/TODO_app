import { useMemo, useState, type KeyboardEvent } from "react";
import { TriangleAlertIcon } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import { useTodos } from "@/services/todos/useTodos";
import {
  autoLayout,
  displayEdges,
  placeNew,
  type Point,
} from "@/services/workflow/diagramLayout";
import {
  mergePositions,
  readPositions,
  writePositions,
} from "@/services/workflow/diagramPositions";
import {
  brokenMigrations,
  draftOf,
  hasEdge,
  withStatusAdded,
  withTransitionAdded,
  withTransitionRemoved,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import {
  draftChanges,
  workflowWarnings,
} from "@/services/workflow/draftChanges";
import {
  pushed,
  redone,
  startHistory,
  undone,
} from "@/services/workflow/draftHistory";
import type { WorkflowModel } from "@/services/workflow/statuses";
import {
  usePublishWorkflow,
  type WorkflowEdit,
} from "@/services/workflow/usePublishWorkflow";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { toast } from "@/stores/toasts";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";

import PublishReview from "./PublishReview";
import WorkflowDiagram, { type Selection } from "./WorkflowDiagram";
import WorkflowInspector from "./WorkflowInspector";
import WorkflowTable from "./WorkflowTable";
import WorkflowToolbar, {
  type EditorMode,
  type NewStatus,
} from "./WorkflowToolbar";

const TITLE = "Manage workflow";
const WIDTH = "w-[calc(100vw-2rem)]";

export default function ManageWorkflowsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const workflow = useWorkflow();
  const todos = useTodos();

  if (workflow.data && todos.data) {
    return (
      <ManageWorkflowsDialog
        model={workflow.data}
        todos={todos.data}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal title={TITLE} onClose={onClose} width="w-[420px]">
      <h2 className={DIALOG_TITLE}>{TITLE}</h2>

      <p
        role={workflow.isError || todos.isError ? "alert" : "status"}
        className="text-ink-3 text-meta grid min-h-48 place-items-center"
      >
        {workflow.isError || todos.isError
          ? "The workflow could not be loaded."
          : "Loading workflow..."}
      </p>
    </Modal>
  );
}

function edgesOf(draft: WorkflowDraft) {
  return displayEdges(
    draft.statuses.map((status) => status.id),
    draft.transitions,
  );
}

function initialPositions(boardId: string | undefined, draft: WorkflowDraft) {
  return mergePositions(
    draft.statuses.map((status) => status.id),
    readPositions(boardId),
    autoLayout(draft.statuses, edgesOf(draft).edges),
  );
}

function typing(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;

  return (
    target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

function ManageWorkflowsDialog({
  model,
  todos,
  onClose,
}: {
  model: WorkflowModel;
  todos: Todo[];
  onClose: () => void;
}) {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const [base, setBase] = useState(() => draftOf(model));
  const [history, setHistory] = useState(() => startHistory(base));
  const [mode, setMode] = useState<EditorMode>("diagram");
  const [selection, setSelection] = useState<Selection>(null);
  const [positions, setPositions] = useState(() =>
    initialPositions(boardId, base),
  );
  const [confirm, setConfirm] = useState<"discard" | "close" | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const publish = usePublishWorkflow();
  const draft = history.present;

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

  const shown = useMemo(() => edgesOf(draft), [draft]);

  // A status an undo brought back, or one added elsewhere since the editor
  // opened, has no position yet; it gets the auto layout's, clear of the rest.
  const layout = useMemo(() => {
    const ids = draft.statuses.map((status) => status.id);
    const missing = ids.some((id) => !positions[id]);

    return mergePositions(
      ids,
      positions,
      missing ? autoLayout(draft.statuses, shown.edges) : {},
    );
  }, [draft.statuses, positions, shown.edges]);

  const changes = useMemo(
    () => draftChanges(base, draft, counts),
    [base, draft, counts],
  );
  const warnings = useMemo(() => workflowWarnings(draft), [draft]);
  const flagged = useMemo(
    () => new Set(warnings.map((warning) => warning.statusId)),
    [warnings],
  );

  const dirty = changes.length > 0;
  const broken = brokenMigrations(draft);
  const stale = model.version !== base.version && !publish.isPending;
  const publishBlocked = stale
    ? "Someone else published first. Start over from the latest to publish."
    : broken.length > 0
      ? "Work from a deleted status points at a hidden one. Show that status first."
      : null;

  const current: Selection =
    selection?.kind === "status" &&
    draft.statuses.some((status) => status.id === selection.id)
      ? selection
      : selection?.kind === "edge" &&
          hasEdge(draft, selection.from, selection.to)
        ? selection
        : null;

  function edit(change: WorkflowEdit): boolean {
    const next = change(draft);

    if (next) setHistory((previous) => pushed(previous, next));

    return next !== null;
  }

  function place(id: string, at: Point) {
    const next = { ...layout, [id]: at };

    setPositions(next);
    writePositions(boardId, next);
  }

  function requestClose() {
    if (reviewing) setReviewing(false);
    else if (confirm) setConfirm(null);
    else if (dirty) setConfirm("close");
    else onClose();
  }

  function discard() {
    setHistory((previous) => pushed(previous, base));
    setConfirm(null);
  }

  function startOver() {
    const latest = draftOf(model);

    setBase(latest);
    setHistory(startHistory(latest));
    setPositions(initialPositions(boardId, latest));
    setSelection(null);
  }

  function handlePublish() {
    const published = draft;

    publish.mutate(
      (latest) => (latest.version === published.version ? published : null),
      {
        onSuccess: () => {
          toast.success("Workflow published");
          onClose();
        },
      },
    );
  }

  function addStatus({ name, category, columnId }: NewStatus) {
    const id = crypto.randomUUID();
    const next = withStatusAdded(draft, { id, columnId, name, category });

    if (!next) return;

    setHistory((previous) => pushed(previous, next));

    const fallback = autoLayout(next.statuses, edgesOf(next).edges)[id];

    place(
      id,
      placeNew(layout, draft.statuses, category, fallback ?? { x: 0, y: 0 }),
    );
    setSelection({ kind: "status", id });
  }

  function connect(from: string, to: string) {
    if (!hasEdge(draft, from, to)) {
      edit((next) => withTransitionAdded(next, from, to));
    }

    setSelection({ kind: "edge", from, to });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (reviewing || event.defaultPrevented || typing(event)) return;

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && key === "z") {
      event.preventDefault();
      setHistory((previous) =>
        event.shiftKey ? redone(previous) : undone(previous),
      );
    } else if (mod && key === "y") {
      event.preventDefault();
      setHistory(redone);
    } else if (event.key === "Escape" && current && !confirm) {
      // marks it for Modal: the first Escape clears the selection, the next one closes
      event.preventDefault();
      setSelection(null);
    } else if (
      (event.key === "Delete" || event.key === "Backspace") &&
      current?.kind === "edge"
    ) {
      event.preventDefault();
      edit((next) => withTransitionRemoved(next, current.from, current.to));
      setSelection(null);
    }
  }

  const boardTitle = board?.title ?? "This board";

  return (
    <Modal title={TITLE} onClose={requestClose} width={WIDTH}>
      <div
        onKeyDown={onKeyDown}
        className="relative flex h-[calc(100dvh-4.5rem)] flex-col"
      >
        <WorkflowToolbar
          boardTitle={boardTitle}
          draft={draft}
          selectedStatusId={current?.kind === "status" ? current.id : null}
          changeCount={changes.length}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          publishBlocked={publishBlocked}
          mode={mode}
          onMode={setMode}
          onAddStatus={addStatus}
          onAddTransition={connect}
          onUndo={() => setHistory(undone)}
          onRedo={() => setHistory(redone)}
          onDiscard={() => setConfirm("discard")}
          onPublish={() => setReviewing(true)}
          onClose={requestClose}
        />

        {confirm && (
          <div
            role="alertdialog"
            aria-label="Unpublished changes"
            className="border-status-red/30 bg-status-red/5 rounded-control mt-3 flex flex-wrap items-center gap-2 border px-3 py-2"
          >
            <p className="text-ink-2 text-meta mr-auto">
              {confirm === "close"
                ? `Close without publishing? Your ${changes.length} unpublished ${changes.length === 1 ? "change is" : "changes are"} lost.`
                : `Discard ${changes.length} unpublished ${changes.length === 1 ? "change" : "changes"}? You can still undo this.`}
            </p>

            <button
              type="button"
              autoFocus
              onClick={() => setConfirm(null)}
              className={cn(DIALOG_CANCEL, "h-8")}
            >
              Keep editing
            </button>

            <button
              type="button"
              onClick={confirm === "close" ? onClose : discard}
              className={cn(DIALOG_DANGER, "h-8")}
            >
              {confirm === "close" ? "Close without publishing" : "Discard"}
            </button>
          </div>
        )}

        {stale && (
          <p
            role="alert"
            className="border-status-orange/40 bg-status-orange/10 text-ink-2 rounded-control text-meta mt-3 flex gap-2.5 border px-3 py-2.5"
          >
            <TriangleAlertIcon className="text-status-orange mt-0.5 size-4 shrink-0" />

            <span>
              Someone published a change to this workflow while you were
              editing.
              <button
                type="button"
                onClick={startOver}
                className="text-brand ml-1.5 font-medium underline-offset-2 hover:underline"
              >
                Start over from the latest
              </button>
            </span>
          </p>
        )}

        {publish.error && !reviewing && (
          <p role="alert" className={DIALOG_ERROR}>
            {publish.error.message}
          </p>
        )}

        <div className="grid min-h-0 flex-1 gap-3 pt-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="flex min-h-0 min-w-0 flex-col">
            {draft.statuses.length === 0 ? (
              <EmptyWorkflow />
            ) : mode === "diagram" ? (
              <WorkflowDiagram
                draft={draft}
                layout={layout}
                edges={shown.edges}
                anyTargets={shown.anyTargets}
                flagged={flagged}
                selection={current}
                onSelect={setSelection}
                onMove={(id, at) =>
                  setPositions((previous) => ({ ...previous, [id]: at }))
                }
                onMoveEnd={() => writePositions(boardId, layout)}
                onAutoLayout={() => {
                  const next = autoLayout(draft.statuses, shown.edges);

                  setPositions(next);
                  writePositions(boardId, next);
                }}
                onConnect={connect}
                onRemoveEdge={(from, to) => {
                  edit((next) => withTransitionRemoved(next, from, to));
                  setSelection(null);
                }}
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <WorkflowTable
                  draft={draft}
                  selection={current}
                  onSelect={setSelection}
                  edit={edit}
                />
              </div>
            )}
          </div>

          <aside
            aria-label="Details"
            className="border-hairline rounded-surface bg-surface flex min-h-0 flex-col overflow-hidden border max-lg:max-h-96"
          >
            <WorkflowInspector
              draft={draft}
              selection={current}
              counts={counts}
              storedIds={storedIds}
              anyTargets={shown.anyTargets}
              warnings={warnings}
              enforced={board?.workflow_enabled ?? true}
              edit={edit}
              onSelect={setSelection}
            />
          </aside>
        </div>

        {reviewing && (
          <PublishReview
            boardTitle={boardTitle}
            changes={changes}
            warnings={warnings.map((warning) => {
              const name =
                draft.statuses.find((status) => status.id === warning.statusId)
                  ?.name ?? "";

              return warning.kind === "no-way-out"
                ? `Work in ${name} can't move anywhere.`
                : `Nothing leads to ${name}.`;
            })}
            pending={publish.isPending}
            error={publish.error?.message ?? null}
            onBack={() => setReviewing(false)}
            onPublish={handlePublish}
          />
        )}
      </div>
    </Modal>
  );
}

function EmptyWorkflow() {
  return (
    <div className="border-hairline rounded-surface bg-wash grid flex-1 place-items-center border border-dashed p-8 text-center">
      <div>
        <p className="text-ink text-meta font-medium">No statuses yet</p>

        <p className="text-ink-3 text-mini mx-auto mt-1 max-w-72">
          A workflow needs at least one status before work can move through it.
          Start with Add status above.
        </p>
      </div>
    </div>
  );
}
