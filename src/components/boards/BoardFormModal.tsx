import { useState } from "react";
import { useNavigate } from "react-router";

import Modal from "@/components/ui/Modal";
import { useCreateBoard } from "@/services/boards/useCreateBoard";
import { useUpdateBoard } from "@/services/boards/useUpdateBoard";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";

/**
 * Create a board, or edit one. One component for the same reason
 * `SpaceFormModal` is: the fields are identical and only the verb differs.
 *
 * **Board settings, deliberately three fields.** Title, description, and which
 * space it is filed in. `icon`, `cover_color` and `visibility` are M8-04's and
 * are not here — each needs a palette or a permission story of its own, and
 * neither is what M15 is for.
 *
 * **The space select is offered only to the board's owner**, because only the
 * owner may file a board: the `boards_space_ownership` trigger refuses anyone
 * else, so showing an admin a control that always fails would be the exact
 * dishonesty `usePermissions` exists to avoid. An admin still edits title and
 * description — M3-17 grants them that, and the database is what enforces it.
 */
export default function BoardFormModal({
  board,
  spaceId = null,
  canFile = true,
  onClose,
}: {
  /** Present means edit; absent means create. */
  board?: IBoard;
  /** Which space a newly created board lands in. */
  spaceId?: string | null;
  /** Whether the caller may change the filing — owner only. */
  canFile?: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { data: spaces = [] } = useSpaces();

  const [title, setTitle] = useState(board?.title ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [space, setSpace] = useState<string>(
    board ? (board.space_id ?? "") : (spaceId ?? ""),
  );

  const createBoard = useCreateBoard();
  const updateBoard = useUpdateBoard();

  const mutation = board ? updateBoard : createBoard;
  const trimmed = title.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!trimmed) return;

    // Empty description clears the column rather than storing "", so "no
    // description" is one value in the database — the rule `taskDraft.ts`
    // already applies to work items.
    const patch = {
      title: trimmed,
      description: description.trim() || null,
    };

    if (board) {
      updateBoard.mutate(
        // `space_id` is sent only when the caller may change it, so an admin's
        // save cannot round-trip a value the trigger would then refuse.
        canFile
          ? { id: board.id, ...patch, space_id: space || null }
          : { id: board.id, ...patch },
        { onSuccess: onClose },
      );

      return;
    }

    const id = crypto.randomUUID();

    createBoard.mutate(
      { id, title: trimmed, spaceId: space || null },
      {
        onSuccess: () => {
          onClose();
          // Straight to the board that was just made. Creating one and being
          // left where you were is the interaction asking "did that work?".
          navigate(`/boards/${id}`);
        },
      },
    );
  }

  return (
    <Modal title={board ? "Board settings" : "Create board"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="mb-6 text-2xl font-bold">
          {board ? "Board settings" : "Create board"}
        </h2>

        <label htmlFor="board-title" className="mb-2 block text-sm font-medium">
          Name
        </label>

        <input
          id="board-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-app focus:ring-brand mb-5 w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2"
          placeholder="Board name..."
        />

        <label
          htmlFor="board-description"
          className="mb-2 block text-sm font-medium"
        >
          Description <span className="text-ink-3 font-normal">(optional)</span>
        </label>

        <textarea
          id="board-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border-app focus:ring-brand mb-5 w-full resize-none rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2"
          placeholder="What is this board for?"
        />

        {canFile && (
          <>
            <label
              htmlFor="board-space"
              className="mb-2 block text-sm font-medium"
            >
              Space
            </label>

            <select
              id="board-space"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="border-app focus:ring-brand mb-2 w-full rounded-xl border bg-transparent px-4 py-3 outline-none focus:ring-2"
            >
              <option value="">No space</option>
              {spaces.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>

            <p className="text-ink-3 mb-6 text-xs">
              Filing only — it does not change who can see this board, and the
              board&rsquo;s task keys never change.
            </p>
          </>
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
            disabled={!trimmed || mutation.isPending}
            className="bg-brand hover:bg-brand/90 text-brand-fg rounded-xl px-4 py-2 disabled:opacity-50"
          >
            {mutation.isPending
              ? board
                ? "Saving..."
                : "Creating..."
              : board
                ? "Save"
                : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
