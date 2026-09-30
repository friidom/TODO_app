import { useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useReorderContainer } from "@/components/dnd/reorderDnd";
import { COUNT_CHIP } from "@/components/columns/columnChrome";
import {
  statusNameTaken,
  statusesOfColumn,
  withStatusAdded,
  type WorkflowDraft,
} from "@/services/workflow/draft";
import type { WorkflowEdit } from "@/services/workflow/usePublishWorkflow";
import { cn } from "@/utils/cn";

import NameInput from "./NameInput";
import StatusChip from "./StatusChip";
import { ADD_BUTTON, LANE_WIDTH, refocus } from "./workflowChrome";
import { STATUS_GROUP, laneId } from "./workflowMove";

export default function UnmappedLane({
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
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();

  const { setNodeRef, isTarget } = useReorderContainer(laneId(null), {
    group: STATUS_GROUP,
    axis: "y",
  });

  const statuses = statusesOfColumn(draft, null);

  return (
    <section
      ref={setNodeRef}
      aria-label={t("workflow.unmappedStatuses")}
      className={cn(
        "rounded-surface bg-wash relative flex min-h-56 shrink-0 flex-col border border-dashed transition-colors",
        LANE_WIDTH,
        isTarget ? "border-brand bg-brand-soft" : "border-ink/20",
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 px-3 select-none">
        <span className="text-ink-2 text-mini truncate font-semibold tracking-wide uppercase">
          {t("workflow.unmappedStatuses")}
        </span>

        <span
          className={COUNT_CHIP}
          aria-label={t("workflow.statusCount", { count: statuses.length })}
        >
          {statuses.length}
        </span>
      </header>

      <p className="text-ink-3 text-mini px-3 pb-2 leading-snug">
        {t("workflow.unmappedHintShort")}
      </p>

      <ul className="flex flex-col gap-1.5 px-2">
        {statuses.map((status) => (
          <StatusChip
            key={status.id}
            status={status}
            draft={draft}
            counts={counts}
            stored={storedIds.has(status.id)}
            edit={edit}
          />
        ))}
      </ul>

      <div className="mt-auto px-2 pt-1.5 pb-2">
        {adding ? (
          <NameInput
            label={t("workflow.newStatusName")}
            placeholder={t("workflow.statusName")}
            validate={(name) =>
              statusNameTaken(draft, name)
                ? t("workflow.statusNameTaken", { name })
                : null
            }
            onSubmit={(name) => {
              edit((next) =>
                withStatusAdded(next, {
                  id: crypto.randomUUID(),
                  columnId: null,
                  name,
                  category: "todo",
                }),
              );
              setAdding(false);
              refocus(addRef);
            }}
            onCancel={() => {
              setAdding(false);
              refocus(addRef);
            }}
          />
        ) : (
          <button
            ref={addRef}
            type="button"
            onClick={() => setAdding(true)}
            className={ADD_BUTTON}
          >
            <PlusIcon />
            {t("workflow.addStatus")}
          </button>
        )}
      </div>
    </section>
  );
}
