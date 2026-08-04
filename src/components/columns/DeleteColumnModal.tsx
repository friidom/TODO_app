import { useState } from "react";
import { ArrowRight, OctagonAlert, X } from "lucide-react";
import { t } from "i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/SideBarUI/dropdown-menu";
import { useDeleteColumn } from "@/services/columns/useDeleteColumn";
import { categoryOf } from "@/constants/columns";
import { cn } from "@/services/lib/utils";
import type { IColumn } from "@/types/data";

const PILL =
  "truncate rounded px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase";

interface Props {
  column: IColumn | null;
  /** Every other column — the possible new homes for this one's work. */
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
  const [target, setTarget] = useState(destinations[0].id);

  const deleteColumn = useDeleteColumn();

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card w-[560px] rounded-2xl p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-3 text-2xl font-bold">
            <OctagonAlert className="shrink-0 text-red-600" size={26} />
            Move work from {t(column.title)} column
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hover:bg-muted rounded-lg p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-secondary mb-8 text-sm">
          Select a new home for any work with the &quot;{t(column.title)}&quot;
          status.
        </p>

        <div className="flex items-end gap-4">
          <div className="min-w-0">
            <p className="mb-3 text-sm font-medium">
              This status will be deleted
            </p>

            <span className={cn(PILL, categoryOf(column.category).pill)}>
              {t(column.title)}
            </span>
          </div>

          <ArrowRight className="mb-2 shrink-0 text-gray-500" size={20} />

          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm font-medium">Work will be moved to</p>

            <DropdownMenu>
              <DropdownMenuTrigger className="border-app flex w-full items-center gap-2 rounded-xl border bg-transparent px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <span className={cn(PILL, categoryOf(selected.category).pill)}>
                  {t(selected.title)}
                </span>
              </DropdownMenuTrigger>

              <DropdownMenuContent>
                <DropdownMenuRadioGroup
                  value={target}
                  onValueChange={setTarget}
                >
                  {destinations.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id}>
                      <span
                        className={cn(PILL, categoryOf(option.category).pill)}
                      >
                        {t(option.title)}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {deleteColumn.error && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {deleteColumn.error.message}
          </p>
        )}

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded-xl px-4 py-2"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={deleteColumn.isPending}
            className="rounded-xl bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {deleteColumn.isPending ? "Deleting..." : "Delete status"}
          </button>
        </div>
      </form>
    </div>
  );
}
