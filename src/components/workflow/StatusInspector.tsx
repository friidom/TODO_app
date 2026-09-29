import { useState } from "react";
import { EyeIcon, EyeOffIcon, Trash2Icon } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CATEGORY_OPTIONS,
  categoryLabelKey,
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
    if (edit((next) => withStatusDeleted(next, statusId, migrateTo, { stored }))) {
      onDeleted();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
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
          <button
            type="button"
            title="Rename status"
            onClick={() => setRenaming(true)}
            className="hover:bg-wash-strong focus-visible:ring-brand rounded-control -mx-1 flex max-w-full px-1 py-0.5 outline-none focus-visible:ring-2"
          >
            <StatusLozenge
              name={status.name}
              category={status.category}
              hidden={status.is_hidden}
            />
          </button>
        )}

        <p className="text-ink-3 text-mini mt-1">
          {column ? `On the ${column.title} column` : "Unmapped"} ·{" "}
          {workItems(count)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-ink-2 text-mini grid gap-1 font-medium">
          Category
          <select
            value={status.category}
            onChange={(e) =>
              edit((next) =>
                withStatusCategory(next, statusId, e.target.value as ColumnCategory),
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
        </label>

        <div className="text-ink-2 text-mini grid gap-1 font-medium">
          Visibility
          <button
            type="button"
            onClick={() =>
              edit((next) => withStatusHidden(next, statusId, !status.is_hidden))
            }
            className="border-hairline hover:bg-wash-strong focus-visible:ring-brand rounded-control text-meta text-ink flex h-8 items-center gap-1.5 border px-2 outline-none focus-visible:ring-2 [&_svg]:size-4"
          >
            {status.is_hidden ? <EyeOffIcon /> : <EyeIcon />}
            {status.is_hidden ? "Hidden" : "Visible"}
          </button>
        </div>
      </div>

      <TransitionEditor draft={draft} statusId={statusId} edit={edit} />

      <div className="border-hairline border-t pt-3">
        {deleting ? (
          <div className="grid gap-2">
            {count > 0 && (
              <label className="text-ink-2 text-mini grid gap-1 font-medium">
                Move {workItems(count)} to
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
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
            className="text-status-red hover:bg-status-red/10 rounded-control text-meta flex h-8 items-center gap-1.5 px-2 font-medium [&_svg]:size-4"
          >
            <Trash2Icon />
            Delete status
          </button>
        )}
      </div>
    </div>
  );
}
