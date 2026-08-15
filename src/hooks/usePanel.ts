import { useCallback } from "react";
import { useSearchParams } from "react-router";

/** The drawers a board can open beside itself. */
export const PANELS = ["members"] as const;

export type PanelKey = (typeof PANELS)[number];

function isPanel(value: string | null): value is PanelKey {
  return !!value && (PANELS as readonly string[]).includes(value);
}

/**
 * Which drawer is open beside the board, held in the URL as `?panel=`.
 *
 * **The `?task=` contract, applied a second time** (M17). `useOpenTask` settled
 * this question at M5-06 and the reasoning carries over unchanged: the board
 * stays mounted behind the drawer, so no route change, no remount, no refetch,
 * and the scroll position and collapsed columns survive. The filter, sort,
 * group and search already live in search params, so opening a drawer cannot
 * drop them and one link carries the whole view.
 *
 * A drawer that were a route would be a second answer to a question already
 * answered — which is exactly what M17 exists to stop the product accumulating.
 *
 * Unknown values resolve to `null` rather than rendering an empty drawer: a
 * hand-edited `?panel=nonsense` is untrusted input like any other.
 */
export function usePanel() {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("panel");
  const panel = isPanel(raw) ? raw : null;

  /**
   * Pushes, like `openTask` and unlike every write in `useBoardView`: opening a
   * drawer is a navigation, and Back is how people expect to leave one.
   */
  const openPanel = useCallback(
    (next: PanelKey) =>
      setSearchParams((previous) => {
        const params = new URLSearchParams(previous);

        params.set("panel", next);
        /**
         * Closing the task is no longer about the slot — the task detail is a
         * modal and takes no width from the board — but it is still right.
         *
         * The trigger for this lives in the board's identity row, which sits
         * *behind* the modal's backdrop, so in practice the two cannot both be
         * asked for by clicking. What is left is a hand-written URL carrying
         * both, and the honest answer to that is still one surface: a drawer
         * revealed underneath an open modal is a state nothing here draws.
         */
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
