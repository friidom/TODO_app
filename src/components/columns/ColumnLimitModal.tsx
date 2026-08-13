import { useState } from "react";
import { X } from "lucide-react";

import { useUpdateColumn } from "@/services/columns/useUpdateColumn";
import type { IColumn } from "@/types/data";

interface Props {
  column: IColumn | null;
  onClose: () => void;
}

/** Empty input means "no limit" — that is the difference between "" and 0. */
function parseLimit(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
}

export default function ColumnLimitModal({ column, onClose }: Props) {
  if (!column) return null;

  return <ColumnLimitDialog column={column} onClose={onClose} />;
}

function ColumnLimitDialog({
  column,
  onClose,
}: {
  column: IColumn;
  onClose: () => void;
}) {
  const [min, setMin] = useState(column.min_limit?.toString() ?? "");
  const [max, setMax] = useState(column.max_limit?.toString() ?? "");

  const updateColumn = useUpdateColumn();

  const minValue = parseLimit(min);
  const maxValue = parseLimit(max);

  const error = Number.isNaN(minValue)
    ? "Minimum must be a whole number of 0 or more."
    : Number.isNaN(maxValue)
      ? "Maximum must be a whole number of 0 or more."
      : minValue !== null && maxValue !== null && minValue > maxValue
        ? "Minimum cannot be greater than maximum."
        : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (error) return;

    updateColumn.mutate(
      { id: column.id, min_limit: minValue, max_limit: maxValue },
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
        className="bg-card w-[480px] rounded-2xl p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-2xl font-bold">Column limit</h2>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hover:bg-muted rounded-lg p-1"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-secondary mb-6 text-sm">
          Set minimum and maximum work item limits for this column.
        </p>

        <div className="mb-2 grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="column-min-limit"
              className="mb-2 block text-sm font-medium"
            >
              Minimum
            </label>

            <input
              id="column-min-limit"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder="No limit set"
              className="border-app w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label
              htmlFor="column-max-limit"
              className="mb-2 block text-sm font-medium"
            >
              Maximum
            </label>

            <input
              id="column-max-limit"
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="No limit set"
              className="border-app w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        {(error || updateColumn.error) && (
          <p className="mt-4 rounded-xl bg-status-red/15 px-4 py-3 text-sm text-status-red">
            {error ?? updateColumn.error?.message}
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
            disabled={!!error || updateColumn.isPending}
            className="rounded-xl bg-brand hover:bg-brand/90 px-4 py-2 text-brand-fg disabled:opacity-50"
          >
            {updateColumn.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
