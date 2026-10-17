import { useTranslation } from "react-i18next";
import { useDroppable } from "@dnd-kit/core";
import { ArrowDown, Ban } from "lucide-react";

import CategoryPill from "../columns/CategoryPill";
import type { DropChoice } from "@/services/workflow/statuses";
import { cn } from "@/utils/cn";

interface Props {
  columnId: string;
  choices: DropChoice[];
  activeStatusId?: string;
}

// covers the column's cards below its h-12 header while a card is dragged over a multi-status column
export default function StatusDropZones({
  columnId,
  choices,
  activeStatusId,
}: Props) {
  const { t } = useTranslation();

  // A column with nothing to offer is one droppable over its own cards, so the drop is still refused while in the
  // air, with a single quiet note instead of a full-height box per status.
  if (choices.every((choice) => !choice.allowed)) {
    return (
      <RefusedZone
        columnId={columnId}
        statusId={choices[0].status.id}
        label={t("kanban.noTransitionTo")}
        names={choices.map((choice) => choice.status)}
      />
    );
  }

  return (
    <div className="animate-in fade-in absolute inset-x-0 top-12 bottom-0 z-10 flex flex-col gap-2 p-2 duration-150">
      {choices.map(({ status, allowed }, index) => (
        <StatusDropZone
          key={status.id}
          columnId={columnId}
          index={index}
          statusId={status.id}
          name={status.name}
          category={status.category}
          allowed={allowed}
          active={status.id === activeStatusId}
        />
      ))}
    </div>
  );
}

function RefusedZone({
  columnId,
  statusId,
  label,
  names,
}: {
  columnId: string;
  statusId: string;
  label: string;
  names: { id: string; name: string; category: string }[];
}) {
  const { setNodeRef } = useDroppable({
    id: `status-zone:${columnId}:${statusId}`,
    data: { type: "status-zone", columnId, index: 0, statusId },
  });

  return (
    <div
      ref={setNodeRef}
      className="animate-in fade-in absolute inset-x-0 top-12 bottom-0 z-10 cursor-not-allowed p-2 duration-150"
    >
      <div className="border-hairline bg-elevated text-ink-3 rounded-control shadow-e1 flex flex-wrap items-center justify-center gap-1.5 border px-2 py-1.5 text-center">
        <Ban className="size-3.5 shrink-0" />
        <span className="text-meta font-medium">{label}</span>
        {names.map((status) => (
          <CategoryPill
            key={status.id}
            title={status.name}
            category={status.category}
            className="max-w-full"
          />
        ))}
      </div>
    </div>
  );
}

function StatusDropZone({
  columnId,
  index,
  statusId,
  name,
  category,
  allowed,
  active,
}: {
  columnId: string;
  index: number;
  statusId: string;
  name: string;
  category: string;
  allowed: boolean;
  active: boolean;
}) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({
    id: `status-zone:${columnId}:${statusId}`,
    data: { type: "status-zone", columnId, index, statusId },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-control flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 border-2 p-2 text-center transition-colors duration-100",
        allowed
          ? active
            ? "border-brand bg-brand-soft text-brand"
            : "border-brand/40 bg-surface text-ink-2 border-dashed"
          : cn(
              "bg-surface text-ink-3 opacity-60",
              active ? "border-ink-3" : "border-hairline border-dashed",
            ),
      )}
    >
      <span className="text-meta font-medium">
        {allowed ? t("kanban.transitionTo") : t("kanban.noTransitionTo")}
      </span>

      <ArrowDown className="size-3.5 shrink-0" />

      <CategoryPill title={name} category={category} className="max-w-full" />
    </div>
  );
}
