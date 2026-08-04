import { useState, useEffect } from "react";
import { useCreateColumn } from "@/services/columns/useCreateColumn";
import { DEFAULT_CATEGORY, type ColumnCategory } from "@/constants/columns";
import CategorySelect from "./CategorySelect";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card w-[420px] rounded-2xl p-6 shadow-2xl"
      >
        <h2 className="mb-6 text-2xl font-bold">Create column</h2>

        <label className="mb-2 block text-sm font-medium">Name</label>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-app mb-6 w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Column name..."
        />

        <label className="mb-2 block text-sm font-medium">
          Status category
        </label>

        <div className="mb-8">
          <CategorySelect value={category} onChange={setCategory} />
        </div>

        {createColumnMutation.error && (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {createColumnMutation.error.message}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-muted rounded-xl px-4 py-2"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!title.trim() || createColumnMutation.isPending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {createColumnMutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
