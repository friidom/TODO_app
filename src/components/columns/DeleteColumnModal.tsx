import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

import DialogHeader from "@/components/ui/DialogHeader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Modal from "@/components/ui/Modal";
import { useDeleteColumn } from "@/services/columns/useDeleteColumn";
import { columnCategory } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { columnTitle } from "@/constants/columns";
import type { IColumn } from "@/types/data";
import CategoryPill from "./CategoryPill";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
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

  const title = t("column.deleteTitle", { name: columnTitle(column.title) });

  return (
    <Modal title={title} onClose={onClose} width="w-[640px]">
      <form onSubmit={handleSubmit}>
        <DialogHeader
          danger
          title={title}
          description={t("column.deleteBody", {
            name: columnTitle(column.title),
          })}
          onClose={onClose}
          className="mb-6"
        />

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
    </Modal>
  );
}
