import Modal from "@/components/ui/Modal";
import { useDeleteSpace } from "@/services/spaces/useDeleteSpace";
import type { ISpace } from "@/types/data";

/**
 * Delete a space. **No typed confirmation, deliberately.**
 *
 * A board deletion destroys work for everyone on it, so `DeleteBoardModal`
 * makes you type the name. Deleting a space destroys a folder: every board
 * inside survives, unchanged, and reappears under Unfiled — `boards.space_id`
 * is `on delete set null`. Demanding the same ceremony for both would teach
 * people to type past the one that matters.
 */
export default function DeleteSpaceModal({
  space,
  boardCount,
  onClose,
}: {
  space: ISpace;
  boardCount: number;
  onClose: () => void;
}) {
  const deleteSpace = useDeleteSpace();

  return (
    <Modal title="Delete space" onClose={onClose}>
      <h2 className="mb-4 text-2xl font-bold">Delete this space?</h2>

      <p className="text-ink-2 mb-6 text-[15px]">
        <span className="text-ink font-semibold">{space.title}</span> will be
        removed.{" "}
        {boardCount > 0 ? (
          <>
            The {boardCount} {boardCount === 1 ? "board" : "boards"} in it{" "}
            <span className="text-ink font-semibold">are not deleted</span> —
            they move to Unfiled, with their members and work items untouched.
          </>
        ) : (
          <>It has no boards in it.</>
        )}
      </p>

      {deleteSpace.error && (
        <p className="bg-status-red/15 text-status-red mb-4 rounded-xl px-4 py-3 text-sm">
          {deleteSpace.error.message}
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
          type="button"
          onClick={() => deleteSpace.mutate(space.id, { onSuccess: onClose })}
          disabled={deleteSpace.isPending}
          className="bg-status-red rounded-xl px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
        >
          {deleteSpace.isPending ? "Deleting..." : "Delete space"}
        </button>
      </div>
    </Modal>
  );
}
