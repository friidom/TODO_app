import { useCallback } from "react";
import { useSearchParams } from "react-router";

export const PANELS = ["members", "activity"] as const;

export type PanelKey = (typeof PANELS)[number];

function isPanel(value: string | null): value is PanelKey {
  return !!value && (PANELS as readonly string[]).includes(value);
}

// held in the URL as ?panel= so the board stays mounted behind it — same contract as useOpenTask's ?task=
export function usePanel() {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("panel");
  const panel = isPanel(raw) ? raw : null;

  // pushes, not replaces — opening a drawer is a navigation, Back should close it
  const openPanel = useCallback(
    (next: PanelKey) =>
      setSearchParams((previous) => {
        const params = new URLSearchParams(previous);

        params.set("panel", next);
        // a drawer revealed underneath an open task modal is a state nothing here draws
        params.delete("task");

        return params;
      }),
    [setSearchParams],
  );

  const closePanel = useCallback(
    () =>
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);

          params.delete("panel");

          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { panel, openPanel, closePanel };
}
