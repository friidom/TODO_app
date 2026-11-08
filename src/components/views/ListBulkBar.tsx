import {
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  ListChecksIcon,
  PencilLineIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import i18n from "@/components/i18n";
import { memberName } from "@/components/members/memberLabels";
import DeleteWorkItemsDialog from "@/components/todo/DeleteWorkItemsDialog";
import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import DialogHeader from "@/components/ui/DialogHeader";
import { Field, SelectBox } from "@/components/ui/FormField";
import Modal from "@/components/ui/Modal";
import {
  MENU_ITEM,
  MENU_LABEL,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { DIALOG_CANCEL, DIALOG_CONFIRM } from "@/components/ui/dialogChrome";
import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { categoryOf } from "@/constants/columns";
import { PRIORITIES } from "@/constants/priorities";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import type { BoardMember } from "@/services/members/membersApi";
import { activeSprintIdOf } from "@/services/sprints/activeSprint";
import { useSprints } from "@/services/sprints/useSprints";
import {
  planFieldEdit,
  planStatusChange,
  type BulkFields,
  type Skipped,
  type StatusMove,
} from "@/services/todos/bulk";
import { epicsOf } from "@/services/todos/subtasks";
import { useBulkActions } from "@/services/todos/useBulkActions";
import { useTodos } from "@/services/todos/useTodos";
import { useWorkflowGate } from "@/services/todos/useWorkflowGate";
import {
  EMPTY_WORKFLOW,
  selectableStatuses,
} from "@/services/workflow/statuses";
import { useWorkflow } from "@/services/workflow/useWorkflow";
import { toast } from "@/stores/toasts";
import type { IStatus, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { fromCalendarDay } from "@/utils/dueDate";

const NO_TODOS: Todo[] = [];

const BAR_BUTTON =
  "hover:bg-canvas/12 aria-expanded:bg-canvas/15 focus-visible:ring-canvas/60 text-meta flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent [&_svg]:size-4 [&_svg]:shrink-0";

function reportSkipped(skipped: Skipped[]) {
  const rows = new Set(skipped.map((skip) => skip.todo.id)).size;

  if (rows > 0) toast.error(i18n.t("bulk.skipped", { count: rows }));
}

function onToolbarKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onClear: () => void,
) {
  if (event.key === "Escape" && !event.defaultPrevented) {
    onClear();
    return;
  }

  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;

  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      "button:enabled",
    ),
  ];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);

  if (at === -1) return;

  event.preventDefault();

  const step = event.key === "ArrowRight" ? 1 : -1;

  buttons[(at + step + buttons.length) % buttons.length].focus();
}

// Jira's floating bar: it appears with a selection and goes with it. Every
// action works on the rows ticked on screen — the count on the bar is the
// count an action touches.
export default function ListBulkBar({
  selected,
  allSelected,
  onSelectAll,
  onClear,
  canEdit,
  members,
}: {
  selected: Todo[];
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  canEdit: boolean;
  members: BoardMember[];
}) {
  const { t } = useTranslation();
  const bulk = useBulkActions();
  const { data: all = NO_TODOS } = useTodos();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  const busy = bulk.pending !== null;
  const locked = !canEdit || busy;

  return (
    // clear of the footer, so Create and the item count stay usable
    <div className="pointer-events-none absolute inset-x-0 bottom-13 z-40 flex justify-center px-3">
      <div
        role="toolbar"
        aria-label={t("bulk.toolbar")}
        onKeyDown={(event) => onToolbarKeyDown(event, onClear)}
        className="bg-ink text-canvas shadow-e3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 pointer-events-auto flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-xl px-1.5 duration-150"
      >
        <span
          aria-live="polite"
          className="text-meta flex shrink-0 items-center gap-2 px-1.5"
        >
          <span className="bg-canvas/15 grid h-6 min-w-6 place-items-center rounded-md px-1.5 text-xs font-semibold tabular-nums">
            {selected.length}
          </span>{" "}
          <span className="sr-only sm:not-sr-only">{t("bulk.selected")}</span>
        </span>

        {!allSelected && (
          <BarButton
            icon={<ListChecksIcon />}
            label={t("bulk.selectAll")}
            onClick={onSelectAll}
          />
        )}

        <Divider />

        <BarButton
          icon={<PencilLineIcon />}
          label={t("bulk.editFields")}
          disabled={locked}
          onClick={() => setDialog("edit")}
        />

        <StatusMenu
          selected={selected}
          all={all}
          disabled={locked}
          onApply={(moves, skipped) => {
            reportSkipped(skipped);

            void bulk.changeStatus(moves);
          }}
        />

        <Divider />

        <BarButton
          icon={<Trash2Icon />}
          label={t("common.delete")}
          disabled={locked}
          danger
          onClick={() => setDialog("delete")}
        />

        <Divider />

        {busy ? (
          <span
            role="status"
            aria-label={t("common.saving")}
            className="grid size-8 shrink-0 place-items-center"
          >
            <span className="border-canvas/30 border-t-canvas size-4 animate-spin rounded-full border-2" />
          </span>
        ) : (
          <button
            type="button"
            onClick={onClear}
            aria-label={t("bulk.clear")}
            title={t("bulk.clear")}
            className={cn(BAR_BUTTON, "w-8 justify-center px-0")}
          >
            <XIcon />
          </button>
        )}
      </div>

      {dialog === "edit" && (
        <EditFieldsDialog
          selected={selected}
          all={all}
          members={members}
          onClose={() => setDialog(null)}
          onApply={(plan, label) => {
            setDialog(null);
            reportSkipped(plan.skipped);

            void bulk.editFields(plan, label);
          }}
        />
      )}

      {dialog === "delete" && (
        <DeleteWorkItemsDialog
          items={selected}
          onClose={() => setDialog(null)}
          onConfirm={(plan) => {
            setDialog(null);

            void bulk.remove(plan.roots, plan.removed).then((ok) => {
              if (ok) onClear();
            });
          }}
        />
      )}
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="bg-canvas/20 mx-1 h-5 w-px shrink-0" />;
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        BAR_BUTTON,
        danger && "hover:bg-status-red hover:text-white",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function StatusMenu({
  selected,
  all,
  disabled,
  onApply,
}: {
  selected: Todo[];
  all: Todo[];
  disabled: boolean;
  onApply: (moves: StatusMove[], skipped: Skipped[]) => void;
}) {
  const { t } = useTranslation();
  const { mounted, close, triggerProps, panelProps } = useCardPopover({
    placement: "top",
  });
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();
  const gate = useWorkflowGate();

  const options = selectableStatuses(workflow.statuses, null).filter(
    (status) => status.column_id !== null,
  );

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        disabled={disabled}
        aria-haspopup="menu"
        aria-label={t("bulk.changeStatus")}
        title={t("bulk.changeStatus")}
        className={BAR_BUTTON}
      >
        <ArrowRightLeftIcon />
        <span className="hidden sm:inline">{t("bulk.changeStatus")}</span>
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("bulk.changeStatus")}
            className={cn(POPOVER_PANEL, "z-50 max-h-80 w-72 overflow-y-auto")}
          >
            <p className={MENU_LABEL}>
              {t("bulk.statusHint", { count: selected.length })}
            </p>

            {options.map((status) => (
              <StatusOption
                key={status.id}
                status={status}
                plan={planStatusChange(
                  selected,
                  status,
                  all,
                  gate.allows,
                  workflow.statusById,
                )}
                statusName={(id) => workflow.statusById.get(id ?? "")?.name}
                selected={selected}
                onPick={(plan) => {
                  close();
                  onApply(plan.moves, plan.skipped);
                }}
              />
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

// aria-disabled, not disabled: a blocked status stays focusable so its reason can be read
function StatusOption({
  status,
  plan,
  statusName,
  selected,
  onPick,
}: {
  status: IStatus;
  plan: ReturnType<typeof planStatusChange>;
  statusName: (id: string | null) => string | undefined;
  selected: Todo[];
  onPick: (plan: ReturnType<typeof planStatusChange>) => void;
}) {
  const { t } = useTranslation();
  const reasonId = useId();

  const current = selected.every((todo) => todo.status_id === status.id);
  const blocked = !current && plan.moves.length === 0;
  const partial = plan.moves.length > 0 && plan.skipped.length > 0;

  const from = [
    ...new Set(
      plan.skipped.flatMap((skip) => statusName(skip.todo.status_id) ?? []),
    ),
  ].join(", ");

  const reason = blocked
    ? from
      ? t("bulk.notAllowedFrom", { from })
      : t("bulk.notAllowed")
    : null;

  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={current || blocked || undefined}
      aria-describedby={reason ? reasonId : undefined}
      onClick={() => {
        if (!current && !blocked) onPick(plan);
      }}
      className={cn(
        MENU_ITEM,
        "aria-disabled:cursor-default aria-disabled:hover:bg-transparent",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span
          className={cn(
            "text-meta inline-flex h-5 max-w-full items-center rounded border px-1.5",
            categoryOf(status.category).lozenge,
            blocked && "opacity-55",
          )}
        >
          <span className="truncate">{status.name}</span>
        </span>

        {reason && (
          <span id={reasonId} className="text-ink-3 text-mini leading-snug">
            {reason}
          </span>
        )}
      </span>

      {current ? (
        <span className="text-ink-3 text-mini flex shrink-0 items-center gap-1">
          <CheckIcon className="text-brand size-3.5" />
          {t("bulk.current")}
        </span>
      ) : partial ? (
        <span className="text-ink-3 text-mini shrink-0 tabular-nums">
          {t("bulk.canMove", {
            count: plan.moves.length,
            total: selected.length,
          })}
        </span>
      ) : null}
    </button>
  );
}

const KEEP = "";
const CLEAR = "__clear__";

type FieldName =
  | "assignee"
  | "priority"
  | "start"
  | "due"
  | "estimate"
  | "sprint"
  | "parent"
  | "label";

const tone = (value: string) =>
  value === KEEP ? "text-ink-3" : "border-brand/40 bg-brand-wash";

function EditFieldsDialog({
  selected,
  all,
  members,
  onClose,
  onApply,
}: {
  selected: Todo[];
  all: Todo[];
  members: BoardMember[];
  onClose: () => void;
  onApply: (plan: ReturnType<typeof planFieldEdit>, label?: string) => void;
}) {
  const { t } = useTranslation();
  const sprintsEnabled = useSprintsEnabled();
  const { data: sprints = [] } = useSprints();
  const { data: workflow = EMPTY_WORKFLOW } = useWorkflow();

  const [values, setValues] = useState<Record<FieldName, string>>({
    assignee: KEEP,
    priority: KEEP,
    start: KEEP,
    due: KEEP,
    estimate: KEEP,
    sprint: KEEP,
    parent: KEEP,
    label: KEEP,
  });

  const set = (field: FieldName) => (value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  const openSprints = sprints.filter((sprint) => sprint.state !== "completed");
  const epics = epicsOf(all);

  const pick = (value: string): string | null | undefined =>
    value === KEEP ? undefined : value === CLEAR ? null : value;

  const date = (value: string) =>
    value === KEEP
      ? undefined
      : value === CLEAR
        ? null
        : fromCalendarDay(value);

  const fields: BulkFields = {
    assignee_id: pick(values.assignee),
    priority: pick(values.priority),
    start_date: date(values.start),
    due_date: date(values.due),
    estimate:
      values.estimate === KEEP
        ? undefined
        : values.estimate === CLEAR
          ? null
          : Number(values.estimate),
    sprint_id: pick(values.sprint),
    parent_id: pick(values.parent),
    label: values.label.trim() || undefined,
  };

  const changes = Object.values(fields).filter(
    (value) => value !== undefined,
  ).length;

  const estimateError =
    typeof fields.estimate === "number" &&
    !(Number.isFinite(fields.estimate) && fields.estimate >= 0)
      ? t("createItem.estimateInvalid")
      : null;

  const dated = (value: string) => value !== KEEP && value !== CLEAR;
  const datesError =
    dated(values.start) && dated(values.due) && values.start > values.due
      ? t("createItem.datesOrder")
      : null;

  const invalid = Boolean(estimateError || datesError);

  function submit(event: FormEvent) {
    event.preventDefault();

    if (changes === 0 || invalid) return;

    onApply(
      planFieldEdit(selected, fields, all, {
        activeSprintId: activeSprintIdOf(sprints),
        workflow,
      }),
      fields.label,
    );
  }

  const title = t("bulk.editTitle", { count: selected.length });

  return (
    <Modal title={title} onClose={onClose} width="w-[560px]">
      <form noValidate onSubmit={submit}>
        <DialogHeader
          title={title}
          description={t("bulk.editHint")}
          onClose={onClose}
        />

        <div className="flex flex-col gap-5">
          <Section title={t("bulk.sectionAssignment")}>
            <Field
              label={t("fields.assignee")}
              action={
                <ChangeAction
                  value={values.assignee}
                  onChange={set("assignee")}
                />
              }
            >
              {(id) => (
                <SelectBox
                  id={id}
                  value={values.assignee}
                  onChange={set("assignee")}
                  autoFocus
                  className={tone(values.assignee)}
                >
                  <option value={KEEP}>{t("bulk.keep")}</option>
                  <option value={CLEAR}>{t("members.unassigned")}</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {memberName(member)}
                    </option>
                  ))}
                </SelectBox>
              )}
            </Field>

            <Field
              label={t("fields.priority")}
              action={
                <ChangeAction
                  value={values.priority}
                  onChange={set("priority")}
                />
              }
            >
              {(id) => (
                <SelectBox
                  id={id}
                  value={values.priority}
                  onChange={set("priority")}
                  className={tone(values.priority)}
                >
                  <option value={KEEP}>{t("bulk.keep")}</option>
                  <option value={CLEAR}>{t("common.none")}</option>
                  {Object.entries(PRIORITIES).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </SelectBox>
              )}
            </Field>
          </Section>

          <Section title={t("bulk.sectionSchedule")}>
            <DateField
              label={t("fields.startDate")}
              value={values.start}
              onChange={set("start")}
            />

            <DateField
              label={t("fields.dueDate")}
              value={values.due}
              onChange={set("due")}
              error={datesError}
            />
          </Section>

          <Section title={t("bulk.sectionPlanning")}>
            {sprintsEnabled && (
              <Field
                label={t("fields.sprint")}
                action={
                  <ChangeAction
                    value={values.sprint}
                    onChange={set("sprint")}
                  />
                }
              >
                {(id) => (
                  <SelectBox
                    id={id}
                    value={values.sprint}
                    onChange={set("sprint")}
                    className={tone(values.sprint)}
                  >
                    <option value={KEEP}>{t("bulk.keep")}</option>
                    <option value={CLEAR}>{t("bulk.noSprint")}</option>
                    {openSprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>
                        {sprint.name}
                      </option>
                    ))}
                  </SelectBox>
                )}
              </Field>
            )}

            <Field
              label={t("fields.estimate")}
              error={estimateError}
              action={
                <ChangeAction
                  value={values.estimate}
                  clearable
                  onChange={set("estimate")}
                />
              }
            >
              {(id, describedBy) =>
                values.estimate === CLEAR ? (
                  <Cleared id={id} />
                ) : (
                  <input
                    id={id}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={values.estimate}
                    placeholder={t("bulk.keep")}
                    aria-invalid={Boolean(estimateError) || undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => set("estimate")(event.target.value)}
                    className={cn(
                      FIELD_INPUT,
                      "h-10 tabular-nums",
                      tone(values.estimate),
                      estimateError && FIELD_INPUT_INVALID,
                    )}
                  />
                )
              }
            </Field>
          </Section>

          <Section title={t("bulk.sectionHierarchy")}>
            <Field
              label={t("fields.parent")}
              action={
                <ChangeAction value={values.parent} onChange={set("parent")} />
              }
            >
              {(id) => (
                <SelectBox
                  id={id}
                  value={values.parent}
                  onChange={set("parent")}
                  className={tone(values.parent)}
                >
                  <option value={KEEP}>{t("bulk.keep")}</option>
                  <option value={CLEAR}>{t("common.none")}</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.title || t("common.untitled")}
                    </option>
                  ))}
                </SelectBox>
              )}
            </Field>

            <Field
              label={t("bulk.addLabel")}
              hint={t("bulk.labelHint")}
              action={
                <ChangeAction value={values.label} onChange={set("label")} />
              }
            >
              {(id, describedBy) => (
                <input
                  id={id}
                  value={values.label}
                  maxLength={40}
                  placeholder={t("bulk.labelPlaceholder")}
                  aria-describedby={describedBy}
                  onChange={(event) => set("label")(event.target.value)}
                  className={cn(FIELD_INPUT, "h-10", tone(values.label))}
                />
              )}
            </Field>
          </Section>
        </div>

        <footer className="border-hairline -mx-5 mt-6 -mb-5 flex flex-wrap items-center gap-3 border-t px-5 py-3.5">
          <span aria-live="polite" className="text-ink-3 text-meta">
            {changes === 0
              ? t("bulk.noChanges")
              : t("bulk.changes", { count: changes })}
          </span>

          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
              {t("common.cancel")}
            </button>

            <button
              type="submit"
              disabled={changes === 0 || invalid}
              className={DIALOG_CONFIRM}
            >
              {t("bulk.apply", { count: selected.length })}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();

  return (
    <section role="group" aria-labelledby={id} className="min-w-0">
      <h3
        id={id}
        className="text-ink-3 text-mini mb-2.5 font-semibold tracking-wide uppercase"
      >
        {title}
      </h3>

      <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  return (
    <Field
      label={label}
      error={error}
      action={<ChangeAction value={value} clearable onChange={onChange} />}
    >
      {(id, describedBy) =>
        value === CLEAR ? (
          <Cleared id={id} />
        ) : (
          <input
            id={id}
            type="date"
            value={value}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.value || KEEP)}
            className={cn(
              FIELD_INPUT,
              "h-10 dark:scheme-dark",
              tone(value),
              error && FIELD_INPUT_INVALID,
            )}
          />
        )
      }
    </Field>
  );
}

function Cleared({ id }: { id: string }) {
  const { t } = useTranslation();

  return (
    <output
      id={id}
      className={cn(
        FIELD_INPUT,
        tone(CLEAR),
        "text-ink-2 flex h-10 items-center italic",
      )}
    >
      {t("bulk.willClear")}
    </output>
  );
}

function ChangeAction({
  value,
  clearable = false,
  onChange,
}: {
  value: string;
  clearable?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();

  if (value !== KEEP) {
    return (
      <TextAction onClick={() => onChange(KEEP)}>
        <RotateCcwIcon />
        {t("bulk.reset")}
      </TextAction>
    );
  }

  return clearable ? (
    <TextAction onClick={() => onChange(CLEAR)}>{t("common.clear")}</TextAction>
  ) : null;
}

function TextAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-ink-3 hover:text-ink focus-visible:ring-brand text-mini -mr-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium transition-colors outline-none focus-visible:ring-2 [&_svg]:size-3"
    >
      {children}
    </button>
  );
}
