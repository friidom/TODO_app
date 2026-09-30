import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import Modal from "@/components/ui/Modal";
import { useDeleteBoard } from "@/services/boards/useDeleteBoard";
import { confirmLabel, confirmMatches } from "@/services/boards/deleteConfirm";
import type { IBoard } from "@/types/data";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_ERROR,
  DIALOG_LABEL,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";

// typed confirmation is a mistake-guard, not a permission check — the db's owner_id policy is what actually enforces it
export default function DeleteBoardModal({
  board,
  onClose,
}: {
  board: IBoard;
  onClose: () => void;
}) {
  const { t } = useTranslation();
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

        // only redirect if the deleted board is the one on screen
        if (boardId === board.id) navigate("/", { replace: true });
      },
    });
  }

  return (
    <Modal title={t("sidebar.deleteBoard")} onClose={onClose} width="w-[480px]">
      <form onSubmit={handleSubmit}>
        <h2 className={`${DIALOG_TITLE} mb-3`}>{t("boards.deleteQuestion")}</h2>

        <p className={`${DIALOG_BODY} mb-5`}>
          <span className="text-ink font-semibold">{label}</span>{" "}
          {t("boards.deleteBody")}
        </p>

        <label htmlFor="board-confirm" className={DIALOG_LABEL}>
          {t("boards.typePrefix")}{" "}
          <span className="text-ink font-semibold">{label}</span>{" "}
          {t("boards.typeSuffix")}
        </label>

        <input
          id="board-confirm"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className={`${FIELD_INPUT} focus:border-status-red/60 focus:ring-status-red/25 mb-6`}
          placeholder={label}
        />

        {deleteBoard.error && (
          <p className={`${DIALOG_ERROR} mt-0 mb-4`}>
            {deleteBoard.error.message}
          </p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={!matches || deleteBoard.isPending}
            className={DIALOG_DANGER}
          >
            {deleteBoard.isPending
              ? t("common.deleting")
              : t("sidebar.deleteBoard")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
