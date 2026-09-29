import { useState } from "react";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { categoryLabelKey } from "@/constants/columns";
import {
  statusNameTaken,
  withStatusAdded,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import StatusInspector from "./StatusInspector";
import StatusLozenge from "./StatusLozenge";
import { ADD_BUTTON } from "./workflowChrome";

const CELL = "px-3 py-2 text-left align-middle";

export default function WorkflowTable({
  draft,
  counts,
  storedIds,
  edit,
}: {
  draft: WorkflowDraft;
  counts: ReadonlyMap<string, number>;
  storedIds: ReadonlySet<string>;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { t } = useTranslation();

  const columnTitle = new Map(
    draft.columns.map((column) => [column.id, column.title]),
  );

  return (
    <div className="border-hairline rounded-surface overflow-hidden border">
      <table className="text-meta w-full border-collapse">
        <thead className="bg-wash text-ink-2 text-mini tracking-wide uppercase">
          <tr>
            <th className="w-8" />
            <th className={cn(CELL, "font-semibold")}>Status</th>
            <th className={cn(CELL, "font-semibold")}>Category</th>
            <th className={cn(CELL, "font-semibold")}>Column</th>
            <th className={cn(CELL, "text-right font-semibold")}>Out</th>
            <th className={cn(CELL, "text-right font-semibold")}>In</th>
          </tr>
        </thead>

        {draft.statuses.map((status) => {
          const expanded = open === status.id;
          const outgoing = draft.transitions.filter(
            (edge) => edge.from === status.id,
          ).length;
          const incoming = draft.transitions.filter(
            (edge) => edge.to === status.id,
          ).length;

          return (
            <tbody key={status.id} className="border-hairline border-t">
              <tr className={cn(expanded && "bg-wash")}>
                <td className="pl-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${status.name}`}
                    onClick={() => setOpen(expanded ? null : status.id)}
                    className="text-ink-3 hover:text-ink focus-visible:ring-brand rounded-control grid size-6 place-items-center outline-none focus-visible:ring-2"
                  >
                    <ChevronRightIcon
                      className={cn(
                        "size-4 transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                  </button>
                </td>

                <td className={CELL}>
                  <StatusLozenge
                    name={status.name}
                    category={status.category}
                    hidden={status.is_hidden}
                  />
                </td>

                <td className={cn(CELL, "text-ink-2")}>
                  {t(categoryLabelKey(status.category))}
                </td>

                <td className={cn(CELL, "text-ink-2")}>
                  {status.column_id
                    ? (columnTitle.get(status.column_id) ?? "")
                    : "Unmapped"}
                </td>

                <td className={cn(CELL, "text-ink-2 text-right tabular-nums")}>
                  {outgoing}
                </td>

                <td className={cn(CELL, "text-ink-2 text-right tabular-nums")}>
                  {incoming}
                </td>
              </tr>

              {expanded && (
                <tr className="bg-wash">
                  <td />

                  <td colSpan={5} className="px-3 pt-1 pb-4">
                    <StatusInspector
                      draft={draft}
                      statusId={status.id}
                      counts={counts}
                      storedIds={storedIds}
                      edit={edit}
                      onDeleted={() => setOpen(null)}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>

      <div className="border-hairline border-t p-2">
        {adding ? (
          <NameInput
            label="New status name"
            placeholder="Status name"
            validate={(name) =>
              statusNameTaken(draft, name)
                ? t("workflow.statusNameTaken", { name })
                : null
            }
            onSubmit={(name) => {
              const id = crypto.randomUUID();

              if (
                edit((next) =>
                  withStatusAdded(next, {
                    id,
                    columnId: null,
                    name,
                    category: "todo",
                  }),
                )
              ) {
                setOpen(id);
              }

              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={ADD_BUTTON}
          >
            <PlusIcon />
            Add status
          </button>
        )}
      </div>
    </div>
  );
}
