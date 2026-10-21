import { useCallback, useState } from "react";

import {
  readTimelineColumns,
  writeTimelineColumns,
  type TimelineColumnPrefs,
} from "@/services/views/timelineColumns";

export function useTimelineColumns(boardId: string | undefined) {
  const [state, setState] = useState(() => ({
    boardId,
    prefs: readTimelineColumns(boardId),
  }));

  let current = state;

  // adjusted during render rather than in an effect, so another board's
  // widths never paint for a frame
  if (state.boardId !== boardId) {
    current = { boardId, prefs: readTimelineColumns(boardId) };
    setState(current);
  }

  const update = useCallback(
    (change: (prefs: TimelineColumnPrefs) => TimelineColumnPrefs) =>
      setState((previous) => {
        const prefs = change(previous.prefs);

        writeTimelineColumns(previous.boardId, prefs);

        return { ...previous, prefs };
      }),
    [],
  );

  return [current.prefs, update] as const;
}
