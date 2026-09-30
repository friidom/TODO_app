import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { categoryLabelKey, categoryOf } from "@/constants/columns";
import type { WorkflowDraft } from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import StatusLozenge from "./StatusLozenge";
import TransitionEditor from "./TransitionEditor";
import type { Selection } from "./WorkflowDiagram";

const CELL = "px-3 py-2 text-left align-middle";
const HEAD = "px-3 py-2 text-left text-mini font-semibold tracking-wide";

export default function WorkflowTable({
  draft,
  selection,
  onSelect,
  edit,
}: {
  draft: WorkflowDraft;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  edit: (change: WorkflowEdit) => boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const { t } = useTranslation();

  const columnTitle = new Map(
    draft.columns.map((column) => [column.id, column.title]),
  );

  return (
    <div className="border-hairline rounded-surface overflow-hidden border">
      <table className="text-meta w-full border-collapse">
        <thead className="bg-wash text-ink-2 border-hairline border-b">
          <tr>
            <th className="w-8" />
            <th className={HEAD}>{t("fields.status")}</th>
            <th className={HEAD}>{t("workflow.category")}</th>
            <th className={HEAD}>{t("workflow.column")}</th>
            <th className={cn(HEAD, "w-28 text-right")}>
              {t("workflow.canMoveTo")}
            </th>
            <th className={cn(HEAD, "w-32 text-right")}>
              {t("workflow.canArriveFrom")}
            </th>
          </tr>
        </thead>

        {draft.statuses.map((status) => {
          const expanded = open === status.id;
          const selected =
            selection?.kind === "status" && selection.id === status.id;
          const outgoing = draft.transitions.filter(
            (edge) => edge.from === status.id,
          ).length;
          const incoming = draft.transitions.filter(
            (edge) => edge.to === status.id,
          ).length;

          return (
            <tbody
              key={status.id}
              className="border-hairline border-t first:border-t-0"
            >
              <tr
                onClick={() => onSelect({ kind: "status", id: status.id })}
                className={cn(
                  "hover:bg-wash cursor-pointer transition-colors",
                  selected && "bg-brand-soft hover:bg-brand-soft",
                )}
              >
                <td className="pl-2">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={t(
                      expanded
                        ? "workflow.collapseTransitions"
                        : "workflow.expandTransitions",
                      { name: status.name },
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpen(expanded ? null : status.id);
                    }}
                    className="text-ink-3 hover:text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control grid size-6 place-items-center outline-none focus-visible:ring-2"
                  >
                    <ChevronRightIcon
                      className={cn(
                        "size-4 transition-transform duration-150",
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
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        categoryOf(status.category).dot,
                      )}
                    />
                    {t(categoryLabelKey(status.category))}
                  </span>
                </td>

                <td className={cn(CELL, "text-ink-2")}>
                  {status.column_id ? (
                    (columnTitle.get(status.column_id) ?? "")
                  ) : (
                    <span className="text-ink-3">{t("workflow.unmapped")}</span>
                  )}
                </td>

                <td className={cn(CELL, "text-ink-2 text-right tabular-nums")}>
                  {outgoing === 0 ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    outgoing
                  )}
                </td>

                <td className={cn(CELL, "text-ink-2 text-right tabular-nums")}>
                  {incoming === 0 ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    incoming
                  )}
                </td>
              </tr>

              {expanded && (
                <tr className="bg-wash">
                  <td />

                  <td colSpan={5} className="px-3 pt-1 pb-4">
                    <TransitionEditor
                      draft={draft}
                      statusId={status.id}
                      edit={edit}
                      onSelectEdge={(from, to) =>
                        onSelect({ kind: "edge", from, to })
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
