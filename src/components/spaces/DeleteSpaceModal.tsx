import { Loader2 } from "lucide-react";

import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { useDeleteSpace } from "@/services/spaces/useDeleteSpace";
import type { ISpace } from "@/types/data";

// No typed confirmation — unlike deleting a board, this only deletes a folder; boards inside just drop out (space_id is on delete set null).
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
      <h2 className={DIALOG_TITLE}>Delete this space?</h2>

      <p className={`${DIALOG_BODY} mt-2`}>
        <span className="text-ink font-medium">{space.title}</span> will be
        removed.{" "}
        {boardCount > 0 ? (
          <>
            The {boardCount} {boardCount === 1 ? "board" : "boards"} in it{" "}
            <span className="text-ink font-medium">are not deleted</span> — they
            move out of this space, with their members and work items untouched.
          </>
        ) : (
          <>It has no boards in it.</>
        )}
      </p>

      {deleteSpace.error && (
        <p role="alert" className={DIALOG_ERROR}>
          {deleteSpace.error.message}
        </p>
      )}

      <div className={DIALOG_ACTIONS}>
        <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
          Cancel
        </button>

        <button
          type="button"
          onClick={() => deleteSpace.mutate(space.id, { onSuccess: onClose })}
          disabled={deleteSpace.isPending}
          className={DIALOG_DANGER}
        >
          {deleteSpace.isPending && (
            <Loader2 className="size-3.5 animate-spin" />
          )}
          {deleteSpace.isPending ? "Deleting…" : "Delete space"}
        </button>
      </div>
    </Modal>
  );
}
