import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import Modal from "@/components/ui/Modal";
import { useDeleteBoard } from "@/services/boards/useDeleteBoard";
import { confirmLabel, confirmMatches } from "@/services/boards/deleteConfirm";
import type { IBoard } from "@/types/data";

/**
 * Delete a board, behind a typed confirmation (M8-03).
 *
 * **The typed name is a mistake-guard, not a permission.** M2-01's DELETE
 * policy is `owner_id = auth.uid()`, so a non-owner is refused whether or not
 * this modal is reached; what this prevents is deleting the wrong board out of
 * a list of similar names.
 *
 * The warning is specific about the blast radius on purpose. A board deletion
 * cascades to its columns, its work items, its memberships and its invitations
 * — for **every** member, not only the owner pressing the button.
 */
export default function DeleteBoardModal({
  board,
  onClose,
}: {
  board: IBoard;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const navigate = useNavigate();
  const { boardId } = useParams();

  const deleteBoard = useDeleteBoard();

  const label = confirmLabel(board.title);
  const matches = confirmMatches(typed, board.title);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!matches) return;

    deleteBoard.mutate(board.id, {
      onSuccess: () => {
        onClose();

        // Only when the board being deleted is the one on screen. Deleting
        // another board from the sidebar should leave you where you are; `/`
        // re-picks a board, and renders the empty state if none is left.
        if (boardId === board.id) navigate("/", { replace: true });
      },
    });
  }

  return (
    <Modal title="Delete board" onClose={onClose} width="w-[480px]">
      <form onSubmit={handleSubmit}>
        <h2 className="text-status-red mb-4 text-2xl font-bold">
          Delete this board?
        </h2>

        <p className="text-ink-2 mb-5 text-[15px]">
          <span className="text-ink font-semibold">{label}</span> and everything
          in it — every column, every work item, every membership and every
          pending invitation — is deleted for everyone on it. This cannot be
          undone.
        </p>

        <label
          htmlFor="board-confirm"
          className="mb-2 block text-sm font-medium"
        >
          Type <span className="text-ink font-semibold">{label}</span> to
          confirm
        </label>

        <input
          id="board-confirm"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="border-app focus:ring-status-red mb-6 w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2"
          placeholder={label}
        />

        {deleteBoard.error && (
          <p className="bg-status-red/15 text-status-red mb-4 rounded-xl px-4 py-3 text-sm">
            {deleteBoard.error.message}
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
            disabled={!matches || deleteBoard.isPending}
            className="bg-status-red rounded-xl px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleteBoard.isPending ? "Deleting..." : "Delete board"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
