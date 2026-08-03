import { useState, useEffect } from "react";
import { useCreateColumn } from "@/services/columns/useCreateColumn";

interface CreateColumnModalProps {
  open: boolean;
  onClose: () => void;
}

export default function CreateColumnModal({
  open,
  onClose,
}: CreateColumnModalProps) {
  const [title, setTitle] = useState("");

  const createColumnMutation = useCreateColumn();

  useEffect(() => {
    if (!open) setTitle("");
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = title.trim();

    if (!trimmed) return;

    createColumnMutation.mutate(trimmed, {
      onSuccess: () => {
        onClose();
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="w-[420px] rounded-2xl bg-card p-6 shadow-2xl"
      >
        <h2 className="mb-6 text-2xl font-bold">
          Create column
        </h2>

        <label className="mb-2 block text-sm font-medium">
          Name
        </label>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-8 w-full rounded-xl border border-app bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Column name..."
        />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 hover:bg-muted"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!title.trim() || createColumnMutation.isPending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {createColumnMutation.isPending
              ? "Creating..."
              : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}