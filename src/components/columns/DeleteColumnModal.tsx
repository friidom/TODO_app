import { useState } from "react";
import { ArrowRight, ChevronDown, X } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteColumn } from "@/services/columns/useDeleteColumn";
import { categoryOf, columnTitle } from "@/constants/columns";
import { cn } from "@/utils/cn";
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card max-h-full w-[640px] max-w-full overflow-y-auto rounded-2xl p-8 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-ink flex items-center gap-4 text-2xl font-bold">
            <DangerDiamond />
            Move work from {columnTitle(column.title)} column
          </h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-2 hover:bg-ink/10 -mt-1 shrink-0 rounded p-1"
          >
            <X size={22} />
          </button>
        </div>

        <p className="text-ink-2 mb-8 text-[15px]">
          Select a new home for any work with the &quot;
          {columnTitle(column.title)}&quot; status.
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-5 gap-y-3">
          <p className="text-ink text-sm font-semibold">
            This status will be deleted
          </p>

          <span aria-hidden="true" />

          <p className="text-ink text-sm font-semibold">
            Work will be moved to
          </p>

          <span
            className={cn(
              PILL,
              "justify-self-start",
              categoryOf(column.category).pill,
            )}
          >
            {columnTitle(column.title)}
          </span>

          <ArrowRight className="text-ink shrink-0" size={22} />

          <DropdownMenu>
            <DropdownMenuTrigger className="border-hairline focus-visible:border-brand focus-visible:ring-brand data-[popup-open]:border-brand data-[popup-open]:ring-brand flex w-full items-center gap-2 rounded-md border bg-transparent px-3 py-3.5 text-left outline-none focus-visible:ring-1 data-[popup-open]:ring-1">
              <span className={cn(PILL, categoryOf(selected.category).pill)}>
                {columnTitle(selected.title)}
              </span>

              <ChevronDown size={18} className="text-ink-2 ml-auto shrink-0" />
            </DropdownMenuTrigger>

            <DropdownMenuContent>
              <DropdownMenuRadioGroup value={target} onValueChange={setTarget}>
                {destinations.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    <span
                      className={cn(PILL, categoryOf(option.category).pill)}
                    >
                      {columnTitle(option.title)}
                    </span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {deleteColumn.error && (
          <p className="bg-status-red/15 text-status-red mt-6 rounded-md px-4 py-3 text-sm">
            {deleteColumn.error.message}
          </p>
        )}

        <div className="mt-10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-ink hover:bg-ink/10 rounded-md px-4 py-2.5 text-[17px]"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={deleteColumn.isPending}
            className="bg-status-red hover:bg-status-red/85 rounded-md px-5 py-2.5 text-[17px] font-medium text-white disabled:opacity-50"
          >
            {deleteColumn.isPending ? "Deleting..." : "Delete"}
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
