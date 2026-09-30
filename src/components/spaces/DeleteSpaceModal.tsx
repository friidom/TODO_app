import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const deleteSpace = useDeleteSpace();

  return (
    <Modal title={t("sidebar.deleteSpace")} onClose={onClose}>
      <h2 className={DIALOG_TITLE}>{t("spaces.deleteQuestion")}</h2>

      <p className={`${DIALOG_BODY} mt-2`}>
        <span className="text-ink font-medium">{space.title}</span>{" "}
        {t("spaces.willBeRemoved")}{" "}
        {boardCount > 0
          ? t("spaces.boardsKept", { count: boardCount })
          : t("spaces.noBoards")}
      </p>

      {deleteSpace.error && (
        <p role="alert" className={DIALOG_ERROR}>
          {deleteSpace.error.message}
        </p>
      )}

      <div className={DIALOG_ACTIONS}>
        <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
          {t("common.cancel")}
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
          {deleteSpace.isPending
            ? t("common.deleting")
            : t("sidebar.deleteSpace")}
        </button>
      </div>
    </Modal>
  );
}
