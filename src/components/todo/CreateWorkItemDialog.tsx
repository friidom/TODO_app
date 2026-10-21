import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import DialogHeader from "@/components/ui/DialogHeader";
import { Field, SelectBox } from "@/components/ui/FormField";
import Modal from "@/components/ui/Modal";
import { memberName } from "@/components/members/memberLabels";
import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import {
  DEFAULT_PRIORITY,
  PRIORITIES,
  type Priority,
} from "@/constants/priorities";
import {
  DEFAULT_WORK_TYPE,
  WORK_TYPE_LABELS,
  WORK_TYPE_OPTIONS,
  type WorkType,
} from "@/constants/workTypes";
import { useBoardId } from "@/hooks/useBoardId";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { normalizeLabel } from "@/services/todos/labels";
import { isEpic } from "@/services/todos/subtasks";
import { addLabel } from "@/services/todos/todoApi";
import { useAddTodo } from "@/services/todos/useAddTodo";
import { useTodos } from "@/services/todos/useTodos";
import { defaultStatus } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { toast } from "@/stores/toasts";
import { cn } from "@/utils/cn";

const TITLE_MAX = 500;

interface Draft {
  type: WorkType;
  statusId: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: Priority | "";
  startDate: string;
  dueDate: string;
  estimate: string;
  parentId: string;
  labels: string;
}

// One request creates the item with every field it accepts; labels follow, one atomic write each (0038).
export default function CreateWorkItemDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const boardId = useBoardId();
  const { data: statuses = [] } = useStatuses();
  const { data: members = [] } = useBoardMembers(boardId);
  const { data: todos = [] } = useTodos();
  const addTodo = useAddTodo();

  // the API refuses a hidden or unmapped status for new work, so neither is offered
  const placeable = statuses.filter(
    (status) => !status.is_hidden && status.column_id !== null,
  );
  const epics = todos.filter(isEpic);

  const blank = (): Draft => ({
    type: DEFAULT_WORK_TYPE,
    statusId: defaultStatus(statuses)?.id ?? "",
    title: "",
    description: "",
    assigneeId: "",
    priority: DEFAULT_PRIORITY,
    startDate: "",
    dueDate: "",
    estimate: "",
    parentId: "",
    labels: "",
  });

  const [draft, setDraft] = useState<Draft>(blank);
  const [another, setAnother] = useState(false);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const title = draft.title.trim();
  const estimate = draft.estimate === "" ? null : Number(draft.estimate);

  const titleError = !title
    ? t("createItem.summaryRequired")
    : title.length > TITLE_MAX
      ? t("createItem.summaryTooLong", { max: TITLE_MAX })
      : null;
  const estimateError =
    estimate !== null && (!Number.isFinite(estimate) || estimate < 0)
      ? t("createItem.estimateInvalid")
      : null;
  const datesError =
    draft.startDate && draft.dueDate && draft.startDate > draft.dueDate
      ? t("createItem.datesOrder")
      : null;

  const invalid = Boolean(titleError || estimateError || datesError);

  async function submit() {
    setTouched(true);

    if (invalid || !draft.statusId || pending) return;

    const labels = [
      ...new Set(
        draft.labels
          .split(",")
          .map((label) => normalizeLabel(label))
          .filter((label): label is string => Boolean(label)),
      ),
    ];

    setPending(true);

    try {
      // a failed create is already toasted by the MutationCache; this only has to stop the spinner
      const created = await addTodo.mutateAsync({
        id: crypto.randomUUID(),
        title,
        status_id: draft.statusId,
        type: draft.type,
        description: draft.description.trim() || null,
        assignee_id: draft.assigneeId || null,
        priority: draft.priority || null,
        start_date: draft.startDate || null,
        due_date: draft.dueDate || null,
        estimate,
        parent_id: draft.parentId || null,
      });

      for (const label of labels) {
        try {
          await addLabel(created.id, label);
        } catch {
          toast.error(t("createItem.labelFailed", { label }));
        }
      }
    } catch {
      setPending(false);
      return;
    }

    setPending(false);
    toast.success(t("createItem.created"));

    if (another) {
      setDraft((current) => ({
        ...blank(),
        type: current.type,
        statusId: current.statusId,
      }));
      setTouched(false);
    } else {
      onClose();
    }
  }

  const show = (error: string | null) => (touched ? error : null);

  return (
    <Modal title={t("createItem.title")} onClose={onClose} width="w-[640px]">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        className="flex flex-col gap-5"
      >
        <DialogHeader
          title={t("createItem.title")}
          description={t("createItem.requiredNote")}
          onClose={onClose}
          className="mb-0"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.workType")}>
            {(id) => (
              <SelectBox
                id={id}
                value={draft.type}
                onChange={(value) => set("type", value as WorkType)}
              >
                {WORK_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {WORK_TYPE_LABELS[type]}
                  </option>
                ))}
              </SelectBox>
            )}
          </Field>

          <Field label={t("fields.status")}>
            {(id) => (
              <SelectBox
                id={id}
                value={draft.statusId}
                onChange={(value) => set("statusId", value)}
              >
                {placeable.map((status) => (
                  // raw: a status name is user text, never a translation key
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </SelectBox>
            )}
          </Field>
        </div>

        <Field
          label={t("createItem.summary")}
          required
          error={show(titleError)}
        >
          {(id, describedBy) => (
            <input
              id={id}
              autoFocus
              value={draft.title}
              aria-required
              aria-invalid={Boolean(show(titleError))}
              aria-describedby={describedBy}
              onChange={(event) => set("title", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={t("createItem.summaryPlaceholder")}
              className={cn(
                FIELD_INPUT,
                "h-11 text-base font-medium",
                show(titleError) && FIELD_INPUT_INVALID,
              )}
            />
          )}
        </Field>

        <Field label={t("task.description")}>
          {(id) => (
            <textarea
              id={id}
              rows={4}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder={t("createItem.descriptionPlaceholder")}
              className={cn(FIELD_INPUT, "min-h-24 resize-y leading-relaxed")}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.assignee")}>
            {(id) => (
              <SelectBox
                id={id}
                value={draft.assigneeId}
                onChange={(value) => set("assigneeId", value)}
              >
                <option value="">{t("members.unassigned")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {memberName(member)}
                  </option>
                ))}
              </SelectBox>
            )}
          </Field>

          <Field label={t("fields.priority")}>
            {(id) => (
              <SelectBox
                id={id}
                value={draft.priority}
                onChange={(value) => set("priority", value as Priority | "")}
              >
                <option value="">{t("priority.none")}</option>
                {(Object.keys(PRIORITIES) as Priority[]).map((key) => (
                  <option key={key} value={key}>
                    {PRIORITIES[key].label}
                  </option>
                ))}
              </SelectBox>
            )}
          </Field>

          <Field label={t("fields.startDate")}>
            {(id) => (
              <input
                id={id}
                type="date"
                value={draft.startDate}
                onChange={(event) => set("startDate", event.target.value)}
                className={cn(FIELD_INPUT, "h-10 dark:scheme-dark")}
              />
            )}
          </Field>

          <Field label={t("fields.dueDate")} error={show(datesError)}>
            {(id, describedBy) => (
              <input
                id={id}
                type="date"
                value={draft.dueDate}
                aria-invalid={Boolean(show(datesError))}
                aria-describedby={describedBy}
                onChange={(event) => set("dueDate", event.target.value)}
                className={cn(
                  FIELD_INPUT,
                  "h-10 dark:scheme-dark",
                  show(datesError) && FIELD_INPUT_INVALID,
                )}
              />
            )}
          </Field>

          <Field label={t("task.storyPoints")} error={show(estimateError)}>
            {(id, describedBy) => (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={draft.estimate}
                aria-invalid={Boolean(show(estimateError))}
                aria-describedby={describedBy}
                onChange={(event) => set("estimate", event.target.value)}
                placeholder="—"
                className={cn(
                  FIELD_INPUT,
                  "h-10 tabular-nums",
                  show(estimateError) && FIELD_INPUT_INVALID,
                )}
              />
            )}
          </Field>

          {/* an Epic cannot have a parent: enforce_work_item_hierarchy refuses it */}
          {draft.type !== "Epic" && (
            <Field label={t("fields.parent")}>
              {(id) => (
                <SelectBox
                  id={id}
                  value={draft.parentId}
                  onChange={(value) => set("parentId", value)}
                >
                  <option value="">{t("createItem.noParent")}</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.title || t("common.untitled")}
                    </option>
                  ))}
                </SelectBox>
              )}
            </Field>
          )}
        </div>

        <Field label={t("fields.labels")} hint={t("createItem.labelsHint")}>
          {(id, describedBy) => (
            <input
              id={id}
              value={draft.labels}
              aria-describedby={describedBy}
              onChange={(event) => set("labels", event.target.value)}
              placeholder={t("createItem.labelsPlaceholder")}
              className={cn(FIELD_INPUT, "h-10")}
            />
          )}
        </Field>

        <footer className="border-hairline -mx-5 -mb-5 flex flex-wrap items-center gap-3 border-t px-5 py-4">
          <label className="text-ink-2 flex cursor-pointer items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={another}
              onChange={(event) => setAnother(event.target.checked)}
              className="accent-brand size-4"
            />
            {t("createItem.another")}
          </label>

          <span className="text-ink-3 text-mini ml-auto hidden sm:inline">
            {t("createItem.shortcut")}
          </span>

          <div className="flex w-full justify-end gap-2 sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="text-ink-2 hover:bg-brand-wash hover:text-ink focus-visible:ring-brand rounded-control h-9 px-3.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2"
            >
              {t("common.cancel")}
            </button>

            <button
              type="submit"
              disabled={pending || !draft.statusId}
              aria-busy={pending}
              className="bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80 focus-visible:ring-brand focus-visible:ring-offset-surface rounded-control flex h-9 items-center gap-2 px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? t("createItem.creating") : t("common.create")}
            </button>
          </div>
        </footer>
      </form>
    </Modal>
  );
}
