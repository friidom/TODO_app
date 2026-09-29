import { useMemo, useState } from "react";
import {
  LayoutGridIcon,
  NetworkIcon,
  PlusIcon,
  TableIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import IconButton from "@/components/ui/IconButton";
import Modal from "@/components/ui/Modal";
import {
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { useTodos } from "@/services/todos/useTodos";
import { defaultLayout, type Point } from "@/services/workflow/diagramLayout";
import {
  brokenMigrations,
  draftOf,
  hasEdge,
  sameWorkflow,
  statusNameTaken,
  withStatusAdded,
  withTransitionRemoved,
} from "@/services/workflow/draft";
import type { WorkflowModel } from "@/services/workflow/statuses";
import {
  usePublishWorkflow,
  type WorkflowEdit,
} from "@/services/workflow/usePublishWorkflow";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import StatusInspector from "./StatusInspector";
import StatusLozenge from "./StatusLozenge";
import WorkflowDiagram, { type Selection } from "./WorkflowDiagram";
import WorkflowTable from "./WorkflowTable";

const TITLE = "Manage workflow";
const WIDTH = "w-[min(1120px,calc(100vw-2rem))]";

type Mode = "diagram" | "text";

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
    <Modal title={TITLE} onClose={onClose} width={WIDTH}>
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

function ManageWorkflowsDialog({
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
  const [mode, setMode] = useState<Mode>("diagram");
  const [selection, setSelection] = useState<Selection>(null);
  const [positions, setPositions] = useState(() =>
    defaultLayout(base.statuses),
  );
  const [adding, setAdding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { t } = useTranslation();

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

  const layout = useMemo(
    () => ({ ...defaultLayout(draft.statuses), ...positions }),
    [draft.statuses, positions],
  );

  const dirty = !sameWorkflow(base, draft);
  const broken = brokenMigrations(draft);
  const stale = model.version !== base.version && !publish.isPending;

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

    if (next) setDraft(next);

    return next !== null;
  }

  function requestClose() {
    if (confirmDiscard) setConfirmDiscard(false);
    else if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function startOver() {
    const latest = draftOf(model);

    setBase(latest);
    setDraft(latest);
    setPositions(defaultLayout(latest.statuses));
    setSelection(null);
  }

  function handlePublish() {
    const published = draft;

    publish.mutate(
      (latest) => (latest.version === published.version ? published : null),
      { onSuccess: onClose },
    );
  }

  function addStatus(name: string) {
    const id = crypto.randomUUID();

    if (
      edit((next) =>
        withStatusAdded(next, { id, columnId: null, name, category: "todo" }),
      )
    ) {
      setSelection({ kind: "status", id });
    }

    setAdding(false);
  }

  return (
    <Modal title={TITLE} onClose={requestClose} width={WIDTH}>
      <div className="flex max-h-[calc(100dvh-4.5rem-2px)] flex-col">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h2 className={DIALOG_TITLE}>{TITLE}</h2>

            <p className="text-ink-3 text-meta mt-0.5">
              Statuses are the steps; transitions are the moves between them. A
              move with no transition is refused. Changes apply once you
              publish.
            </p>
          </div>

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

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Workflow view"
            className="border-hairline rounded-control flex border p-0.5"
          >
            <ModeTab
              active={mode === "diagram"}
              onClick={() => setMode("diagram")}
              icon={<NetworkIcon />}
              label="Diagram"
            />

            <ModeTab
              active={mode === "text"}
              onClick={() => setMode("text")}
              icon={<TableIcon />}
              label="Text"
            />
          </div>

          {mode === "diagram" && (
            <button
              type="button"
              onClick={() => setPositions(defaultLayout(draft.statuses))}
              className="text-ink-2 hover:bg-wash-strong rounded-control text-meta flex h-8 items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
            >
              <LayoutGridIcon />
              Auto-arrange
            </button>
          )}

          <div className="ml-auto">
            {adding ? (
              <NameInput
                label="New status name"
                placeholder="Status name"
                validate={(name) =>
                  statusNameTaken(draft, name)
                    ? t("workflow.statusNameTaken", { name })
                    : null
                }
                onSubmit={addStatus}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-ink-2 hover:bg-wash-strong rounded-control text-meta flex h-8 items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
              >
                <PlusIcon />
                Add status
              </button>
            )}
          </div>
        </div>

        {stale && (
          <p
            role="alert"
            className="border-status-orange/40 bg-status-orange/10 text-ink-2 rounded-control text-meta mb-3 flex gap-2.5 border px-3 py-2.5"
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

        <div className="min-h-0 flex-1 overflow-auto">
          {mode === "diagram" ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_20rem]">
              <WorkflowDiagram
                draft={draft}
                layout={layout}
                onMove={(id, at: Point) =>
                  setPositions((previous) => ({ ...previous, [id]: at }))
                }
                selection={current}
                onSelect={setSelection}
                edit={edit}
              />

              <aside
                aria-label="Details"
                className="border-hairline rounded-surface bg-surface min-h-[22rem] border p-3"
              >
                <Details
                  draft={draft}
                  selection={current}
                  counts={counts}
                  storedIds={storedIds}
                  edit={edit}
                  onClear={() => setSelection(null)}
                />
              </aside>
            </div>
          ) : (
            <WorkflowTable
              draft={draft}
              counts={counts}
              storedIds={storedIds}
              edit={edit}
            />
          )}
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
                  Work from a deleted status points at a hidden one. Show that
                  status before publishing.
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

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-control text-meta focus-visible:ring-brand flex h-7 items-center gap-1.5 px-2.5 font-medium outline-none focus-visible:ring-2 [&_svg]:size-4",
        active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-wash-strong",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Details({
  draft,
  selection,
  counts,
  storedIds,
  edit,
  onClear,
}: {
  draft: Parameters<typeof StatusInspector>[0]["draft"];
  selection: Selection;
  counts: ReadonlyMap<string, number>;
  storedIds: ReadonlySet<string>;
  edit: (change: WorkflowEdit) => boolean;
  onClear: () => void;
}) {
  if (selection?.kind === "status") {
    return (
      <StatusInspector
        key={selection.id}
        draft={draft}
        statusId={selection.id}
        counts={counts}
        storedIds={storedIds}
        edit={edit}
        onDeleted={onClear}
      />
    );
  }

  if (selection?.kind === "edge") {
    const from = draft.statuses.find((it) => it.id === selection.from);
    const to = draft.statuses.find((it) => it.id === selection.to);

    if (!from || !to) return null;

    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-ink-2 text-mini font-semibold tracking-wide uppercase">
          Transition
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <StatusLozenge name={from.name} category={from.category} />
          <span aria-hidden>→</span>
          <StatusLozenge name={to.name} category={to.category} />
        </div>

        <button
          type="button"
          onClick={() => {
            edit((next) => withTransitionRemoved(next, from.id, to.id));
            onClear();
          }}
          className="text-status-red hover:bg-status-red/10 rounded-control text-meta flex h-8 w-fit items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
        >
          <Trash2Icon />
          Remove transition
        </button>
      </div>
    );
  }

  return (
    <p className="text-ink-3 text-meta leading-relaxed">
      Select a status to rename it or edit its transitions. Hover a status and
      drag from its right-hand dot onto another status to connect them. Select
      an arrow to remove it.
    </p>
  );
}
