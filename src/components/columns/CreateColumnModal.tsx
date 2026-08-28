import { useState, useEffect } from "react";
import { useCreateColumn } from "@/services/columns/useCreateColumn";
import { DEFAULT_CATEGORY, type ColumnCategory } from "@/constants/columns";
import CategorySelect from "./CategorySelect";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_LABEL,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";

interface CreateColumnModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateColumnModal({
  open,
  onClose,
}: CreateColumnModalProps) {
  // The form lives in its own component so closing unmounts it — that resets
  // the fields for free, with no effect syncing state to the `open` prop.
  if (!open) return null;

  return <CreateColumnDialog onClose={onClose} />;
}

function CreateColumnDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ColumnCategory>(DEFAULT_CATEGORY);

  const createColumnMutation = useCreateColumn();

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      // The category dropdown handles Escape first when it is open.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = title.trim();

    if (!trimmed) return;

    createColumnMutation.mutate(
      { title: trimmed, category },
      {
        onSuccess: () => {
          onClose();
        },
      },
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
        className="border-hairline bg-surface rounded-surface max-h-full w-[420px] max-w-full overflow-y-auto border p-5 shadow-e3 sm:p-6"
      >
        <h2 className={`${DIALOG_TITLE} mb-5`}>Create column</h2>

        <label className={DIALOG_LABEL}>Name</label>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${FIELD_INPUT} mb-6`}
          placeholder="Column name..."
        />

        <label className={DIALOG_LABEL}>Status category</label>

        <div className="mb-8">
          <CategorySelect value={category} onChange={setCategory} />
        </div>

        {createColumnMutation.error && (
          <p className={`${DIALOG_ERROR} mt-0 mb-4`}>
            {createColumnMutation.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            Cancel
          </button>

          <button
            type="submit"
            disabled={!title.trim() || createColumnMutation.isPending}
            className={DIALOG_CONFIRM}
          >
            {createColumnMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
