import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  NetworkIcon,
  PlusIcon,
  Redo2Icon,
  SplineIcon,
  TableIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import IconButton from "@/components/ui/IconButton";
import { POPOVER_PANEL, TOOLBAR_DIVIDER } from "@/components/ui/controlChrome";
import {
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import type { ColumnCategory } from "@/constants/columns";
import {
  columnCategoryOf,
  hasEdge,
  statusNameTaken,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import { cn } from "@/utils/cn";

import { CategoryPicker } from "./InspectorParts";
import { MOD_KEY, SELECT } from "./workflowChrome";

export type EditorMode = "diagram" | "table";

export interface NewStatus {
  name: string;
  category: ColumnCategory;
  columnId: string | null;
}

const BAR_BUTTON =
  "rounded-control text-meta focus-visible:ring-brand flex h-8 items-center gap-1.5 px-2 font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4";

const LABEL = "text-ink-2 text-mini grid gap-1 font-medium";

export default function WorkflowToolbar({
  boardTitle,
  draft,
  selectedStatusId,
  changeCount,
  canUndo,
  canRedo,
  publishBlocked,
  mode,
  onMode,
  onAddStatus,
  onAddTransition,
  onUndo,
  onRedo,
  onDiscard,
  onPublish,
  onClose,
}: {
  boardTitle: string;
  draft: WorkflowDraft;
  selectedStatusId: string | null;
  changeCount: number;
  canUndo: boolean;
  canRedo: boolean;
  publishBlocked: string | null;
  mode: EditorMode;
  onMode: (mode: EditorMode) => void;
  onAddStatus: (status: NewStatus) => void;
  onAddTransition: (from: string, to: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDiscard: () => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState<"status" | "transition" | null>(null);
  const { t } = useTranslation();

  return (
    <header className="border-hairline flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3">
      <div className="min-w-0">
        <p className="text-ink-3 text-mini flex min-w-0 items-center gap-1">
          <span className="truncate">{boardTitle}</span>
          <ChevronRightIcon aria-hidden className="size-3 shrink-0" />
          <span>{t("workflow.workflow")}</span>
        </p>

        <div className="flex items-center gap-2">
          <h2 className={DIALOG_TITLE}>{t("workflow.manageTitle")}</h2>

          {changeCount > 0 ? (
            <span className="bg-status-orange/15 text-ink-2 text-micro inline-flex h-5 items-center gap-1.5 rounded-full px-2 font-semibold">
              <span className="bg-status-orange size-1.5 rounded-full" />
              {t("workflow.draftChanges", { count: changeCount })}
            </span>
          ) : (
            <span className="text-ink-3 text-micro">
              {t("workflow.noUnpublished")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ToolbarPopover
          label={t("workflow.addStatus")}
          icon={<PlusIcon />}
          open={open === "status"}
          onOpenChange={(next) => setOpen(next ? "status" : null)}
        >
          <AddStatusPanel
            draft={draft}
            onSubmit={(status) => {
              onAddStatus(status);
              setOpen(null);
            }}
            onCancel={() => setOpen(null)}
          />
        </ToolbarPopover>

        <ToolbarPopover
          label={t("workflow.addTransition")}
          icon={<SplineIcon />}
          disabled={draft.statuses.length < 2}
          open={open === "transition"}
          onOpenChange={(next) => setOpen(next ? "transition" : null)}
        >
          <TransitionComposer
            draft={draft}
            initialFrom={selectedStatusId}
            onSubmit={(from, to) => {
              onAddTransition(from, to);
              setOpen(null);
            }}
            onCancel={() => setOpen(null)}
          />
        </ToolbarPopover>

        <span aria-hidden className={TOOLBAR_DIVIDER} />

        <div
          role="tablist"
          aria-label={t("workflow.viewLabel")}
          className="border-hairline rounded-control flex border p-0.5"
        >
          <ModeTab
            active={mode === "diagram"}
            onClick={() => onMode("diagram")}
            icon={<NetworkIcon />}
            label={t("workflow.diagram")}
          />

          <ModeTab
            active={mode === "table"}
            onClick={() => onMode("table")}
            icon={<TableIcon />}
            label={t("workflow.table")}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <IconButton
          label={t("workflow.undo", { keys: `${MOD_KEY}Z` })}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Undo2Icon />
        </IconButton>

        <IconButton
          label={t("workflow.redo", { keys: `${MOD_KEY}⇧Z` })}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Redo2Icon />
        </IconButton>

        <span aria-hidden className={TOOLBAR_DIVIDER} />

        <button
          type="button"
          disabled={changeCount === 0}
          onClick={onDiscard}
          className={cn(DIALOG_CANCEL, "h-8")}
        >
          {t("workflow.discardChanges")}
        </button>

        <button
          type="button"
          disabled={changeCount === 0 || publishBlocked !== null}
          title={publishBlocked ?? undefined}
          onClick={onPublish}
          className={cn(DIALOG_CONFIRM, "h-8")}
        >
          {t("workflow.publishChanges")}
        </button>

        <IconButton label={t("common.close")} size="md" onClick={onClose}>
          <XIcon />
        </IconButton>
      </div>
    </header>
  );
}

function ToolbarPopover({
  label,
  icon,
  open,
  onOpenChange,
  disabled = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (!rootRef.current?.contains(target)) onOpenChange(false);
    }

    document.addEventListener("mousedown", onPointerDown);

    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, onOpenChange]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          // marks it for Modal, so Escape closes this panel and not the editor
          event.preventDefault();
          onOpenChange(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
        className={cn(
          BAR_BUTTON,
          open ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-wash-strong",
        )}
      >
        {icon}
        {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            POPOVER_PANEL,
            "absolute top-full left-0 z-40 mt-1.5 w-80 p-3",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function AddStatusPanel({
  draft,
  onSubmit,
  onCancel,
}: {
  draft: WorkflowDraft;
  onSubmit: (status: NewStatus) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ColumnCategory>("todo");
  // undefined follows the category: the first column already showing it
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const { t } = useTranslation();

  const suggested =
    draft.columns.find(
      (column) => columnCategoryOf(draft, column.id) === category,
    )?.id ?? null;
  const columnId = picked === undefined ? suggested : picked;
  const trimmed = name.trim();
  const taken = trimmed !== "" && statusNameTaken(draft, trimmed);

  function submit(event: FormEvent) {
    event.preventDefault();

    if (trimmed && !taken) onSubmit({ name: trimmed, category, columnId });
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <p className="text-ink text-meta font-semibold">
        {t("workflow.newStatus")}
      </p>

      <label className={LABEL}>
        {t("common.name")}
        <input
          autoFocus
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("workflow.statusNamePlaceholder")}
          aria-invalid={taken}
          className={cn(SELECT, "bg-elevated", taken && "border-status-red/60")}
        />
        {taken && (
          <span role="alert" className="text-status-red font-normal">
            {t("workflow.statusNameTaken", { name: trimmed })}
          </span>
        )}
      </label>

      <div className={LABEL}>
        {t("workflow.category")}
        <CategoryPicker value={category} onChange={setCategory} />
      </div>

      <label className={LABEL}>
        {t("workflow.boardColumn")}
        <select
          value={columnId ?? ""}
          onChange={(event) => setPicked(event.target.value || null)}
          className={SELECT}
        >
          <option value="">{t("workflow.notOnBoard")}</option>

          {draft.columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.title}
            </option>
          ))}
        </select>
        {columnId === null && (
          <span className="text-ink-3 font-normal">
            {t("workflow.staysOffBoard")}
          </span>
        )}
      </label>

      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className={cn(DIALOG_CANCEL, "h-8")}
        >
          {t("common.cancel")}
        </button>

        <button
          type="submit"
          disabled={!trimmed || taken}
          className={cn(DIALOG_CONFIRM, "h-8")}
        >
          {t("workflow.addStatus")}
        </button>
      </div>
    </form>
  );
}

// Jira's "Add transition": name both ends up front, rather than making the
// reader find the source on the canvas and drag from it.
function TransitionComposer({
  draft,
  initialFrom,
  onSubmit,
  onCancel,
}: {
  draft: WorkflowDraft;
  initialFrom: string | null;
  onSubmit: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(initialFrom ?? draft.statuses[0]?.id ?? "");
  const [to, setTo] = useState(
    draft.statuses.find((status) => status.id !== from)?.id ?? "",
  );

  const duplicate = hasEdge(draft, from, to);
  const invalid = from === "" || to === "" || from === to || duplicate;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        if (!invalid) onSubmit(from, to);
      }}
      className="grid gap-3"
    >
      <p className="text-ink text-meta font-semibold">
        {t("workflow.newTransition")}
      </p>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <label className={LABEL}>
          {t("workflow.from")}
          <select
            autoFocus
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

        <ArrowRightIcon aria-hidden className="text-ink-3 mb-2 size-4" />

        <label className={LABEL}>
          {t("workflow.to")}
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
      </div>

      {(from === to || duplicate) && from !== "" && (
        <p role="status" className="text-ink-3 text-mini">
          {from === to
            ? t("workflow.selfTransition")
            : t("workflow.transitionExists")}
        </p>
      )}

      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className={cn(DIALOG_CANCEL, "h-8")}
        >
          {t("common.cancel")}
        </button>

        <button
          type="submit"
          disabled={invalid}
          className={cn(DIALOG_CONFIRM, "h-8")}
        >
          {t("workflow.addTransition")}
        </button>
      </div>
    </form>
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
