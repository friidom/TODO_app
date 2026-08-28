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
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";

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
        className="border-hairline bg-surface rounded-surface max-h-full w-[640px] max-w-full overflow-y-auto border p-5 shadow-e3 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className={`${DIALOG_TITLE} flex items-center gap-2.5`}>
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

        <p className={`${DIALOG_BODY} mb-6`}>
          Select a new home for any work with the &quot;
          {columnTitle(column.title)}&quot; status.
        </p>

        {/* Each side is a labelled cell rather than two rows of a 3x2 grid, so
            the stacked layout below `sm` reads "from -> to" instead of putting
            both labels together and both values together. */}
        <div className="grid grid-cols-1 gap-y-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-x-5 sm:gap-y-0">
          <div className="min-w-0">
            <p className="text-ink text-meta mb-2 font-semibold">
              This status will be deleted
            </p>

            <span
              className={cn(
                PILL,
                "inline-block max-w-full",
                categoryOf(column.category).pill,
              )}
            >
              {columnTitle(column.title)}
            </span>
          </div>

          <ArrowRight
            className="text-ink-3 shrink-0 justify-self-center max-sm:rotate-90 sm:mb-1"
            size={20}
            aria-hidden="true"
          />

          <div className="min-w-0">
            <p className="text-ink text-meta mb-2 font-semibold">
              Work will be moved to
            </p>

            <DropdownMenu>
              <DropdownMenuTrigger className="border-hairline bg-canvas focus-visible:border-brand focus-visible:ring-brand/30 data-[popup-open]:border-brand rounded-control flex w-full items-center gap-2 border px-3 py-2 text-left outline-none focus-visible:ring-2">
                <span
                  className={cn(
                    PILL,
                    "min-w-0",
                    categoryOf(selected.category).pill,
                  )}
                >
                  {columnTitle(selected.title)}
                </span>

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
        </div>

        {deleteColumn.error && (
          <p className={DIALOG_ERROR}>{deleteColumn.error.message}</p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            Cancel
          </button>

          <button
            type="submit"
            disabled={deleteColumn.isPending}
            className={DIALOG_DANGER}
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
