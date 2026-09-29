import { useState, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import IconButton from "@/components/ui/IconButton";
import {
  CATEGORY_OPTIONS,
  categoryLabelKey,
  categoryOf,
  type ColumnCategory,
} from "@/constants/columns";
import {
  statusNameTaken,
  withStatusCategory,
  withStatusDeleted,
  withStatusHidden,
  withStatusRenamed,
  workItemCount,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import StatusLozenge from "./StatusLozenge";
import TransitionEditor from "./TransitionEditor";
import { SELECT, workItems } from "./workflowChrome";

export default function StatusInspector({
  draft,
  statusId,
  counts,
  storedIds,
  edit,
  onDeleted,
}: {
  draft: WorkflowDraft;
  statusId: string;
  counts: ReadonlyMap<string, number>;
  storedIds: ReadonlySet<string>;
  edit: (change: WorkflowEdit) => boolean;
  onDeleted: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [target, setTarget] = useState("");
  const { t } = useTranslation();

  const status = draft.statuses.find((it) => it.id === statusId);

  if (!status) return null;

  const count = workItemCount(draft, status.id, counts);
  const column = draft.columns.find((it) => it.id === status.column_id);
  const targets = draft.statuses.filter(
    (it) => it.id !== status.id && !it.is_hidden && it.column_id !== null,
  );
  const stored = storedIds.has(status.id);

  function remove(migrateTo: string | null) {
    if (
      edit((next) => withStatusDeleted(next, statusId, migrateTo, { stored }))
    ) {
      onDeleted();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-hairline border-b px-3 py-2.5">
        <h3 className="text-ink text-meta font-semibold">Status</h3>

        <p className="text-ink-3 text-mini mt-0.5">
          One step work passes through on this board.
        </p>
      </div>

      <div className="flex flex-col gap-4 p-3">
        <Field
          label="Name"
          action={
            renaming ? undefined : (
              <IconButton
                label="Rename status"
                size="xs"
                onClick={() => setRenaming(true)}
              >
                <PencilIcon />
              </IconButton>
            )
          }
        >
          {renaming ? (
            <NameInput
              initial={status.name}
              label="Status name"
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
            <StatusLozenge
              name={status.name}
              category={status.category}
              hidden={status.is_hidden}
            />
          )}
        </Field>

        <Field label="Category">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                categoryOf(status.category).dot,
              )}
            />

            <select
              aria-label="Status category"
              value={status.category}
              onChange={(event) =>
                edit((next) =>
                  withStatusCategory(
                    next,
                    statusId,
                    event.target.value as ColumnCategory,
                  ),
                )
              }
              className={SELECT}
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(categoryLabelKey(option.value))}
                </option>
              ))}
            </select>
          </span>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Column">
            <span className="text-ink text-meta truncate">
              {column ? (
                column.title
              ) : (
                <span className="text-ink-3">Unmapped</span>
              )}
            </span>
          </Field>

          <Field label="Work items">
            <span className="text-ink text-meta tabular-nums">{count}</span>
          </Field>
        </div>

        <Field label="Visibility">
          <button
            type="button"
            onClick={() =>
              edit((next) =>
                withStatusHidden(next, statusId, !status.is_hidden),
              )
            }
            className="border-hairline hover:bg-wash-strong focus-visible:ring-brand rounded-control text-meta text-ink flex h-8 w-full items-center gap-1.5 border px-2 outline-none focus-visible:ring-2 [&_svg]:size-4"
          >
            {status.is_hidden ? <EyeOffIcon /> : <EyeIcon />}
            {status.is_hidden ? "Hidden" : "Visible"}

            <span className="text-ink-3 text-mini ml-auto truncate">
              {status.is_hidden ? "takes no new work" : "can receive work"}
            </span>
          </button>
        </Field>

        <TransitionEditor draft={draft} statusId={statusId} edit={edit} />
      </div>

      <div className="border-hairline mt-auto border-t p-3">
        {deleting ? (
          <div className="grid gap-2">
            {count > 0 && (
              <label className="text-ink-2 text-mini grid gap-1 font-medium">
                Move {workItems(count)} to
                <select
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  className={SELECT}
                >
                  <option value="" disabled>
                    Choose a status...
                  </option>

                  {targets.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setDeleting(false)}
                className="text-ink-2 hover:bg-wash-strong rounded-control text-mini h-7 px-2.5 font-medium"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={count > 0 && target === ""}
                onClick={() => remove(count > 0 ? target : null)}
                className="bg-status-red hover:bg-status-red/90 rounded-control text-mini h-7 px-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete status
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
            Delete status
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-ink-2 text-mini font-medium">{label}</span>
        {action}
      </div>

      <div className="flex min-w-0 flex-col">{children}</div>
    </div>
  );
}
