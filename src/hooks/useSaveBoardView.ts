import { useTranslation } from "react-i18next";

import { useUpdateBoard } from "@/services/boards/useUpdateBoard";
import type { BoardViewPrefs } from "@/services/views/boardViewPrefs";
import { toast } from "@/stores/toasts";
import { useBoardViewPrefsStore } from "@/stores/boardViewPrefs";

// Publishes the view on screen as the board's, for everyone. Only once the server has it are this device's unsaved
// changes dropped: they are what was saved, so the board looks the same before and after.
export function useSaveBoardView() {
  const { t } = useTranslation();
  const update = useUpdateBoard();
  const setPersonal = useBoardViewPrefsStore((state) => state.setPersonal);

  function save(boardId: string, prefs: BoardViewPrefs) {
    update.mutate(
      { id: boardId, view_settings: prefs },
      {
        onSuccess: () => {
          setPersonal(boardId, null, prefs);
          toast.success(t("viewSettings.boardViewSaved"));
        },
      },
    );
  }

  return { save, isPending: update.isPending };
}
