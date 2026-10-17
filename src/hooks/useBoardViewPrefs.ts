import { useCallback, useMemo } from "react";

import { useBoardId } from "@/hooks/useBoardId";
import { useBoard } from "@/services/boards/useBoard";
import {
  normalizeBoardViewPrefs,
  resolveBoardViewPrefs,
  type BoardViewPrefs,
} from "@/services/views/boardViewPrefs";
import { useBoardViewPrefsStore } from "@/stores/boardViewPrefs";

// The settings the open board renders with, and the two writes on them. Saving for everyone is useSaveBoardView.
export function useBoardViewPrefs() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);
  const personal = useBoardViewPrefsStore((state) =>
    boardId ? state.personal[boardId] : undefined,
  );
  const device = useBoardViewPrefsStore((state) => state.device);
  const setPersonal = useBoardViewPrefsStore((state) => state.setPersonal);

  const stored = board?.view_settings;

  const saved = useMemo(
    () => (stored ? normalizeBoardViewPrefs(stored) : null),
    [stored],
  );

  const resolved = useMemo(
    () => resolveBoardViewPrefs({ personal, saved, device }),
    [personal, saved, device],
  );

  const setPrefs = useCallback(
    (patch: Partial<BoardViewPrefs>) => {
      if (!boardId) return;

      setPersonal(boardId, { ...resolved.prefs, ...patch }, resolved.baseline);
    },
    [boardId, resolved, setPersonal],
  );

  const reset = useCallback(() => {
    if (boardId) setPersonal(boardId, null, resolved.baseline);
  }, [boardId, resolved.baseline, setPersonal]);

  return { ...resolved, boardId, setPrefs, reset };
}
