import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  NetworkIcon,
  PlusIcon,
  SplineIcon,
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
  withTransitionAdded,
  withTransitionRemoved,
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

import NameInput from "./NameInput";
import StatusInspector from "./StatusInspector";
import StatusLozenge from "./StatusLozenge";
import WorkflowDiagram, { type Selection } from "./WorkflowDiagram";
import WorkflowTable from "./WorkflowTable";
import { SELECT } from "./workflowChrome";

const TITLE = "Manage workflow";
const WIDTH = "w-[min(1400px,calc(100vw-2rem))]";

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
  const [connecting, setConnecting] = useState(false);
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
      <div className="flex h-[min(54rem,calc(100dvh-5rem))] flex-col">
        <header className="flex items-start justify-between gap-4 pb-3">
          <div className="min-w-0">
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
            className="-mt-1 shrink-0"
          >
            <XIcon />
          </IconButton>
        </header>

        <div className="border-hairline flex flex-wrap items-center gap-2 border-y py-2">
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

          <span aria-hidden className="bg-hairline mx-1 h-6 w-px" />

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
            <BarButton
              onClick={() => {
                setAdding(true);
                setConnecting(false);
              }}
              icon={<PlusIcon />}
            >
              Add status
            </BarButton>
          )}

          <BarButton
            active={connecting}
            disabled={draft.statuses.length < 2}
            onClick={() => {
              setConnecting((open) => !open);
              setAdding(false);
            }}
            icon={<SplineIcon />}
          >
            Add transition
          </BarButton>

          <p className="text-ink-3 text-mini ml-auto tabular-nums">
            {draft.statuses.length} statuses · {draft.transitions.length}{" "}
            transitions
          </p>
        </div>

        {connecting && (
          <TransitionComposer
            draft={draft}
            onAdd={(from, to) => {
              edit((next) => withTransitionAdded(next, from, to));
              setSelection({ kind: "edge", from, to });
              setConnecting(false);
            }}
            onCancel={() => setConnecting(false)}
          />
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

        <div className="grid min-h-0 flex-1 gap-3 pt-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-h-0 min-w-0 flex-col">
            {draft.statuses.length === 0 ? (
              <EmptyWorkflow onAdd={() => setAdding(true)} />
            ) : mode === "diagram" ? (
              <WorkflowDiagram
                draft={draft}
                layout={layout}
                onMove={(id, at: Point) =>
                  setPositions((previous) => ({ ...previous, [id]: at }))
                }
                onAutoArrange={() =>
                  setPositions(defaultLayout(draft.statuses))
                }
                selection={current}
                onSelect={setSelection}
                edit={edit}
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
            className="border-hairline rounded-surface bg-surface flex min-h-0 flex-col overflow-y-auto border max-lg:max-h-80"
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
  icon: ReactNode;
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

function BarButton({
  onClick,
  icon,
  children,
  active = false,
  disabled = false,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "rounded-control text-meta focus-visible:ring-brand flex h-8 items-center gap-1.5 px-2 font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4",
        active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-wash-strong",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// Jira's "Add Transition": name both ends up front, rather than making the
// reader find the source on the canvas and drag from it.
function TransitionComposer({
  draft,
  onAdd,
  onCancel,
}: {
  draft: WorkflowDraft;
  onAdd: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState(draft.statuses[0]?.id ?? "");
  const [to, setTo] = useState(draft.statuses[1]?.id ?? "");

  const duplicate = from !== "" && hasEdge(draft, from, to);
  const invalid = from === "" || to === "" || from === to || duplicate;

  return (
    <div className="border-hairline bg-wash rounded-surface mt-3 flex flex-wrap items-end gap-2 border p-3">
      <label className="text-ink-2 text-mini grid min-w-40 flex-1 gap-1 font-medium">
        From
        <select
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className={SELECT}
        >
          {draft.statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </label>

      <ArrowRightIcon aria-hidden className="text-ink-3 mb-2 size-4 shrink-0" />

      <label className="text-ink-2 text-mini grid min-w-40 flex-1 gap-1 font-medium">
        To
        <select
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className={SELECT}
        >
          {draft.statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={invalid}
        onClick={() => onAdd(from, to)}
        className={cn(DIALOG_CONFIRM, "h-8")}
      >
        Add
      </button>

      <button
        type="button"
        onClick={onCancel}
        className={cn(DIALOG_CANCEL, "h-8")}
      >
        Cancel
      </button>

      {from !== "" && (duplicate || from === to) && (
        <p role="status" className="text-ink-3 text-mini basis-full">
          {from === to
            ? "A status cannot transition to itself."
            : "That transition already exists."}
        </p>
      )}
    </div>
  );
}

function EmptyWorkflow({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-hairline rounded-surface bg-wash grid flex-1 place-items-center border border-dashed p-8 text-center">
      <div>
        <p className="text-ink text-meta font-medium">No statuses yet</p>

        <p className="text-ink-3 text-mini mx-auto mt-1 max-w-72">
          A workflow needs at least one status before work can move through it.
        </p>

        <button
          type="button"
          onClick={onAdd}
          className={cn(DIALOG_CONFIRM, "mt-4")}
        >
          <PlusIcon className="size-4" />
          Add status
        </button>
      </div>
    </div>
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
  draft: WorkflowDraft;
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-hairline border-b px-3 py-2.5">
          <h3 className="text-ink text-meta font-semibold">Transition</h3>

          <p className="text-ink-3 text-mini mt-0.5">
            One allowed move. Work can go this way; every other way is refused
            unless its own transition says otherwise.
          </p>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <Field label="From">
            <StatusLozenge
              name={from.name}
              category={from.category}
              hidden={from.is_hidden}
            />
          </Field>

          <div className="text-ink-3 flex items-center gap-1.5">
            <ArrowRightIcon aria-hidden className="size-4 rotate-90" />
            <span className="text-mini">moves to</span>
          </div>

          <Field label="To">
            <StatusLozenge
              name={to.name}
              category={to.category}
              hidden={to.is_hidden}
            />
          </Field>
        </div>

        <div className="border-hairline mt-auto border-t p-3">
          <button
            type="button"
            onClick={() => {
              edit((next) => withTransitionRemoved(next, from.id, to.id));
              onClear();
            }}
            className="text-status-red hover:bg-status-red/10 rounded-control text-meta flex h-8 w-full items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
          >
            <Trash2Icon />
            Remove transition
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="border-hairline border-b px-3 py-2.5">
        <h3 className="text-ink text-meta font-semibold">Details</h3>

        <p className="text-ink-3 text-mini mt-0.5">Nothing selected.</p>
      </div>

      <div className="text-ink-3 text-mini flex flex-col gap-2 p-3 leading-relaxed">
        <p>
          Select a status to rename it, change its category or edit the
          transitions in and out of it.
        </p>

        <p>Select an arrow to see the move it allows and remove it.</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-ink-2 text-mini font-medium">{label}</span>
      <span className="flex min-w-0">{children}</span>
    </div>
  );
}
