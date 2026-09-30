import { useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import IconButton from "@/components/ui/IconButton";
import {
  statusNameTaken,
  withStatusCategory,
  withStatusDeleted,
  withStatusHidden,
  withStatusMoved,
  withStatusRenamed,
  withStatusUnmapped,
  workItemCount,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowWarning } from "@/services/workflow/draftChanges";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";

import {
  CategoryPicker,
  Field,
  InspectorHeader,
  InspectorSection,
} from "./InspectorParts";
import NameInput from "./NameInput";
import TransitionEditor from "./TransitionEditor";
import { SELECT, workItems } from "./workflowChrome";

const WARNING_KEY: Record<WorkflowWarning["kind"], string> = {
  "no-way-out": "workflow.warnHereNoWayOut",
  "no-way-in": "workflow.warnHereNoWayIn",
};

export default function StatusInspector({
  draft,
  statusId,
  counts,
  storedIds,
  anyTarget,
  warnings,
  edit,
  onSelectEdge,
  onClose,
}: {
  draft: WorkflowDraft;
  statusId: string;
  counts: ReadonlyMap<string, number>;
  storedIds: ReadonlySet<string>;
  anyTarget: boolean;
  warnings: WorkflowWarning[];
  edit: (change: WorkflowEdit) => boolean;
  onSelectEdge: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [target, setTarget] = useState("");
  const { t } = useTranslation();

  const status = draft.statuses.find((it) => it.id === statusId);

  if (!status) return null;

  const count = workItemCount(draft, status.id, counts);
  const targets = draft.statuses.filter(
    (it) => it.id !== status.id && !it.is_hidden && it.column_id !== null,
  );
  const stored = storedIds.has(status.id);
  const locked = count > 0 && status.column_id !== null;

  function remove(migrateTo: string | null) {
    if (
      edit((next) => withStatusDeleted(next, statusId, migrateTo, { stored }))
    ) {
      onClose();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InspectorHeader eyebrow={t("fields.status")} onClose={onClose}>
        {renaming ? (
          <NameInput
            initial={status.name}
            label={t("workflow.statusName")}
            className="flex-1"
            validate={(name) =>
              statusNameTaken(draft, name, status.id)
                ? t("workflow.statusNameTaken", { name })
                : null
            }
            onSubmit={(name) => {
              edit((next) => withStatusRenamed(next, statusId, name));
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <h3
              title={status.name}
              className="text-ink min-w-0 truncate text-sm font-semibold"
            >
              {status.name}
            </h3>

            <IconButton
              label={t("workflow.renameStatus")}
              size="xs"
              onClick={() => setRenaming(true)}
            >
              <PencilIcon />
            </IconButton>
          </>
        )}
      </InspectorHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {warnings.length > 0 && (
          <div
            role="status"
            className="border-status-orange/40 bg-status-orange/10 text-ink-2 rounded-control text-mini mx-3 mt-3 flex gap-2 border px-2.5 py-2"
          >
            <TriangleAlertIcon className="text-status-orange mt-px size-3.5 shrink-0" />

            <ul className="grid gap-1">
              {warnings.map((warning) => (
                <li key={warning.kind}>{t(WARNING_KEY[warning.kind])}</li>
              ))}
            </ul>
          </div>
        )}

        <InspectorSection title={t("workflow.details")} collapsible={false}>
          <div className="grid gap-3">
            <Field label={t("workflow.category")}>
              <CategoryPicker
                value={status.category}
                onChange={(category) =>
                  edit((next) => withStatusCategory(next, statusId, category))
                }
              />
            </Field>

            <Field label={t("workflow.boardColumn")}>
              <select
                aria-label={t("workflow.boardColumn")}
                value={status.column_id ?? ""}
                onChange={(event) => {
                  const columnId = event.target.value;

                  edit((next) =>
                    columnId === ""
                      ? withStatusUnmapped(next, statusId)
                      : withStatusMoved(
                          next,
                          statusId,
                          columnId,
                          Number.POSITIVE_INFINITY,
                        ),
                  );
                }}
                className={SELECT}
              >
                <option value="" disabled={locked}>
                  {t("workflow.notOnBoard")}
                </option>

                {draft.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>

              {(status.column_id === null || locked) && (
                <p className="text-ink-3 text-mini mt-1">
                  {status.column_id === null
                    ? t("workflow.unmappedHint")
                    : t("workflow.holdsStays", { items: workItems(count) })}
                </p>
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t("workflow.workItemsLabel")}>
                <span className="text-ink text-meta h-8 leading-8 tabular-nums">
                  {count}
                </span>
              </Field>

              <Field label={t("workflow.newWork")}>
                <button
                  type="button"
                  aria-pressed={!status.is_hidden}
                  onClick={() =>
                    edit((next) =>
                      withStatusHidden(next, statusId, !status.is_hidden),
                    )
                  }
                  className="border-hairline hover:bg-wash-strong focus-visible:ring-brand rounded-control text-meta text-ink flex h-8 w-full items-center gap-1.5 border px-2 outline-none focus-visible:ring-2 [&_svg]:size-4"
                >
                  {status.is_hidden ? <EyeOffIcon /> : <EyeIcon />}
                  {status.is_hidden
                    ? t("workflow.hidden")
                    : t("workflow.accepted")}
                </button>
              </Field>
            </div>
          </div>
        </InspectorSection>

        <TransitionEditor
          draft={draft}
          statusId={statusId}
          edit={edit}
          anyTarget={anyTarget}
          onSelectEdge={onSelectEdge}
        />
      </div>

      <div className="border-hairline border-t p-3">
        {deleting ? (
          <div
            role="alertdialog"
            aria-label={t("workflow.deleteStatus")}
            className="grid gap-2"
          >
            <p className="text-ink text-meta font-medium">
              {t("workflow.deleteQuestion", { name: status.name })}
            </p>

            {count > 0 ? (
              <label className="text-ink-2 text-mini grid gap-1 font-medium">
                {t("workflow.moveItsItemsTo", { items: workItems(count) })}
                <select
                  autoFocus
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  className={SELECT}
                >
                  <option value="" disabled>
                    {t("workflow.chooseStatus")}
                  </option>

                  {targets.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-ink-3 text-mini">
                {t("workflow.deleteEmptyHint")}
              </p>
            )}

            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                autoFocus={count === 0}
                onClick={() => setDeleting(false)}
                className="text-ink-2 hover:bg-wash-strong rounded-control text-mini h-7 px-2.5 font-medium"
              >
                {t("workflow.keepIt")}
              </button>

              <button
                type="button"
                disabled={count > 0 && target === ""}
                onClick={() => remove(count > 0 ? target : null)}
                className="bg-status-red hover:bg-status-red/90 rounded-control text-mini h-7 px-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("workflow.deleteStatus")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="text-status-red hover:bg-status-red/10 rounded-control text-meta flex h-8 w-full items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
          >
            <Trash2Icon />
            {t("workflow.deleteStatus")}
          </button>
        )}
      </div>
    </div>
  );
}
