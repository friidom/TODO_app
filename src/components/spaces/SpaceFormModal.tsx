import { useState } from "react";

import Modal from "@/components/ui/Modal";
import { useCreateSpace } from "@/services/spaces/useCreateSpace";
import { useUpdateSpace } from "@/services/spaces/useUpdateSpace";
import type { ISpace } from "@/types/data";

/**
 * Create a space, or rename one. One component, because the form is one field
 * and two components would be one field twice.
 *
 * `space` present means rename. The parent unmounts this on close, so the field
 * resets for free — the idiom `CreateColumnModal` established.
 */
export default function SpaceFormModal({
  space,
  onClose,
}: {
  space?: ISpace;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(space?.title ?? "");

  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();

  const mutation = space ? updateSpace : createSpace;
  const trimmed = title.trim();

  // The column's own constraint is 1–60 characters trimmed. Matching it here
  // turns a database error into a disabled button; the constraint is still what
  // enforces it, because this form is not the only writer.
  const tooLong = trimmed.length > 60;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!trimmed || tooLong) return;

    if (space) {
      updateSpace.mutate(
        { id: space.id, title: trimmed },
        { onSuccess: onClose },
      );
    } else {
      createSpace.mutate({ title: trimmed }, { onSuccess: onClose });
    }
  }

  return (
    <Modal title={space ? "Rename space" : "Create space"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="mb-6 text-2xl font-bold">
          {space ? "Rename space" : "Create space"}
        </h2>

        <label htmlFor="space-title" className="mb-2 block text-sm font-medium">
          Name
        </label>

        <input
          id="space-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          className="border-app focus:ring-brand mb-2 w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2"
          placeholder="Work, Personal, Clients…"
        />

        <p className="text-ink-3 mb-6 text-xs">
          A space is a folder for your boards. It does not change who can see
          them.
        </p>

        {tooLong && (
          <p className="text-status-red mb-4 text-sm">
            Keep it to 60 characters or fewer.
          </p>
        )}

        {mutation.error && (
          <p className="bg-status-red/15 text-status-red mb-4 rounded-xl px-4 py-3 text-sm">
            {mutation.error.message}
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
            disabled={!trimmed || tooLong || mutation.isPending}
            className="bg-brand hover:bg-brand/90 text-brand-fg rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {mutation.isPending
              ? space
                ? "Saving..."
                : "Creating..."
              : space
                ? "Save"
                : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
