import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowRight, ChevronDown, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import IconButton from "@/components/ui/IconButton";
import { useDeleteColumn } from "@/services/columns/useDeleteColumn";
import { columnCategory } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { columnTitle } from "@/constants/columns";
import type { IColumn } from "@/types/data";
import CategoryPill from "./CategoryPill";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";

interface Props {
  column: IColumn | null;
  destinations: IColumn[];
  onClose: () => void;
}

export default function DeleteColumnModal({
  column,
  destinations,
  onClose,
}: Props) {
  if (!column || !destinations.length) return null;

  return (
    <DeleteColumnDialog
      column={column}
      destinations={destinations}
      onClose={onClose}
    />
  );
}

function DeleteColumnDialog({
  column,
  destinations,
  onClose,
}: {
  column: IColumn;
  destinations: IColumn[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(destinations[0].id);

  const deleteColumn = useDeleteColumn();
  const { data: statuses = [] } = useStatuses();

  const selected =
    destinations.find((option) => option.id === target) ?? destinations[0];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    deleteColumn.mutate(
      { id: column.id, moveToColumnId: target },
      { onSuccess: onClose },
    );
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="border-hairline bg-surface rounded-surface shadow-e3 max-h-full w-[640px] max-w-full overflow-y-auto border p-5 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className={`${DIALOG_TITLE} flex items-center gap-2.5`}>
            <DangerDiamond />
            {t("column.deleteTitle", { name: columnTitle(column.title) })}
          </h2>

          <IconButton
            label={t("common.close")}
            size="md"
            tooltip={false}
            onClick={onClose}
            className="-mt-1"
          >
            <X />
          </IconButton>
        </div>

        <p className={`${DIALOG_BODY} mb-6`}>
          {t("column.deleteBody", { name: columnTitle(column.title) })}
        </p>

        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-x-5 sm:gap-y-0">
          <div className="min-w-0">
            <p className="text-ink text-meta mb-2 font-semibold">
              {t("column.statusWillBeDeleted")}
            </p>

            <CategoryPill
              title={columnTitle(column.title)}
              category={columnCategory(statuses, column.id)}
              className="max-w-full"
            />
          </div>

          <ArrowRight
            className="text-ink-3 shrink-0 justify-self-center max-sm:rotate-90 sm:mb-1"
            size={20}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <p className="text-ink text-meta mb-2 font-semibold">
              {t("column.workMovedTo")}
            </p>

            <DropdownMenu>
              <DropdownMenuTrigger className="border-hairline bg-canvas focus-visible:border-brand focus-visible:ring-brand/30 data-[popup-open]:border-brand rounded-control flex w-full items-center gap-2 border px-3 py-2 text-left outline-none focus-visible:ring-2">
                <CategoryPill
                  title={columnTitle(selected.title)}
                  category={columnCategory(statuses, selected.id)}
                />

                <ChevronDown
                  size={16}
                  className="text-ink-3 ml-auto shrink-0"
                />
              </DropdownMenuTrigger>

              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={target}
                  onValueChange={setTarget}
                >
                  {destinations.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      <CategoryPill
                        title={columnTitle(option.title)}
                        category={columnCategory(statuses, option.id)}
                      />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {deleteColumn.error && (
          <p className={DIALOG_ERROR}>{deleteColumn.error.message}</p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={deleteColumn.isPending}
            className={DIALOG_DANGER}
          >
            {deleteColumn.isPending ? t("common.deleting") : t("common.delete")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Jira's danger glyph: a rounded red diamond. lucide has no diamond-alert. */
function DangerDiamond() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      className="text-status-red shrink-0"
      aria-hidden="true"
    >
      <rect
        x="4.5"
        y="4.5"
        width="15"
        height="15"
        rx="3"
        transform="rotate(45 12 12)"
        fill="currentColor"
      />
      <path
        d="M12 7.5v5.5"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.6" r="1.3" fill="white" />
    </svg>
  );
}
