import type { ReactNode } from "react";

/**
 * The frame every view of a board renders inside (M17).
 *
 * **This is the milestone's load-bearing deliverable, and the reason the
 * redesign precedes Calendar and Timeline.** Four slots, defined once:
 *
 * - `identity` — which board this is: breadcrumb, title, counts, members, the
 *   board's own actions. Constant across views, because it describes the board
 *   rather than the rendering.
 * - `toolbar` — which view, and how it is narrowed: the view tabs plus search,
 *   filter, group, sort and create. Also constant, because M16 made all five
 *   view-agnostic.
 * - `children` — the only part a view supplies.
 * - `drawer` — the task panel or a board drawer, pushing at `xl` and overlaying
 *   below, both addressed by a search param.
 *
 * M19 and M20 therefore add a registry entry and a renderer. Neither adds a
 * layout, a header, or a second answer to where a filter control lives — which
 * is exactly what a redesign that only redesigned the Kanban would have left
 * them to invent.
 *
 * The `min-h-0` / `min-w-0` chain is load-bearing rather than decorative: a
 * flex child defaults to `min-height: auto` and refuses to shrink below its
 * content, which would push the board's horizontal scroll onto the page instead
 * of keeping it inside the board.
 */
export default function ViewShell({
  identity,
  toolbar,
  drawer,
  children,
}: {
  identity: ReactNode;
  toolbar: ReactNode;
  /** Absent when no `?task=` or `?panel=` is set, which is the common case. */
  drawer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {identity}
        {toolbar}

        {/* The workspace. The gutter lives here rather than inside each view,
            so Board, List and everything after them align to one vertical line
            without each re-deciding it — and it is the SAME `px-5 md:px-6` the
            identity row and the toolbar use, which is what makes the three read
            as one surface rather than three stacked components. */}
        <div className="min-h-0 min-w-0 flex-1 px-5 pt-4 md:px-6">
          {children}
        </div>
      </div>

      {drawer}
    </div>
  );
}
