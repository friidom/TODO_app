import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate } from "react-router";

import Modal from "@/components/ui/Modal";
import { useCreateBoard } from "@/services/boards/useCreateBoard";
import { useUpdateBoard } from "@/services/boards/useUpdateBoard";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_LABEL,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";

// space select only shows for the owner — a trigger refuses filing from anyone else, so it'd be a control that always fails
export default function BoardFormModal({
  board,
  spaceId = null,
  canFile = true,
  onClose,
}: {
  board?: IBoard;
  spaceId?: string | null;
  canFile?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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

    // empty clears the column instead of storing "" — one value for "no description"
    const patch = {
      title: trimmed,
      description: description.trim() || null,
    };

    if (board) {
      updateBoard.mutate(
        // sent only when the caller may actually change it
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
          navigate(`/boards/${id}`);
        },
      },
    );
  }

  return (
    <Modal
      title={board ? t("sidebar.boardSettings") : t("boards.create")}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <h2 className={`${DIALOG_TITLE} mb-5`}>
          {board ? t("sidebar.boardSettings") : t("boards.create")}
        </h2>

        <label htmlFor="board-title" className={DIALOG_LABEL}>
          {t("common.name")}
        </label>

        <input
          id="board-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${FIELD_INPUT} mb-5`}
          placeholder={t("boards.namePlaceholder")}
        />

        <label htmlFor="board-description" className={DIALOG_LABEL}>
          {t("task.description")}{" "}
          <span className="text-ink-3 font-normal">{t("common.optional")}</span>
        </label>

        <textarea
          id="board-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${FIELD_INPUT} mb-5 resize-none`}
          placeholder={t("boards.descriptionPlaceholder")}
        />

        {canFile && (
          <>
            <label htmlFor="board-space" className={DIALOG_LABEL}>
              {t("boards.space")}
            </label>

            <select
              id="board-space"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className={`${FIELD_INPUT} mb-2`}
            >
              <option value="">{t("boards.noSpace")}</option>
              {spaces.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>

            <p className="text-ink-3 mb-6 text-xs">{t("boards.filingHint")}</p>
          </>
        )}

        {mutation.error && (
          <p className={`${DIALOG_ERROR} mt-0 mb-4`}>
            {mutation.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={!trimmed || mutation.isPending}
            className={DIALOG_CONFIRM}
          >
            {mutation.isPending
              ? board
                ? t("common.saving")
                : t("common.creating")
              : board
                ? t("common.save")
                : t("common.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
