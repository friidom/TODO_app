import { categoryOf } from "@/constants/columns";
import { PRIORITIES, toPriority } from "@/constants/priorities";
import { workTypeOf } from "@/constants/workTypes";
import type {
  placeItem,
  TimelineItem,
  TimelineScale,
} from "@/services/views/timeline";
import type { IColumn, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDue } from "@/utils/dueDate";
import { taskKey } from "@/utils/taskKey";
import { ROW_HEIGHT, trackColumns } from "./timelineAxis";

type Placement = NonNullable<ReturnType<typeof placeItem>>;

/**
 * One work item as a row: its name on the left, its range on the axis (M20).
 *
 * **The bar carries no text.** The rail beside it already names the item, and a
 * label inside a bar is legible only while the bar is wide — so a two-day task
 * would show an empty capsule and a three-month one would repeat what is six
 * inches to its left. The bar's job is to say *when*; the rail's is to say
 * *what*.
 *
 * **Colour comes from the board's own status palette**, `categoryOf(...).dot` —
 * the same green a Done column is on the board and in the Summary donut. Three
 * tones, all of them already in the product: no legend to learn, and no new
 * colour introduced for this view, which is M17's token-continuity rule.
 *
 * **A square end means "continues past this edge".** A range that started in
 * June is drawn from the first column with its left end squared off, rather
 * than being dropped or being redrawn as if it began here. A rounded end is the
 * real start or the real finish.
 */
export default function TimelineRow({
  item,
  place,
  ticks,
  scale,
  column,
  keyPrefix,
  locale,
  today,
  onOpen,
}: {
  item: TimelineItem;
  place: Placement;
  ticks: number;
  scale: TimelineScale;
  /** The column the item is in — its category is the bar's colour. */
  column?: IColumn;
  keyPrefix: string;
  locale?: string;
  today: string;
  onOpen: () => void;
}) {
  const { todo } = item;

  const tone = categoryOf(column?.category).dot;

  const label = item.isPoint
    ? `${todo.title ?? "Untitled"} — ${formatDue(item.start, today, locale)}`
    : `${todo.title ?? "Untitled"} — ${formatDue(item.start, today, locale)} to ${formatDue(item.end, today, locale)}`;

  return (
    <Row>
      <RowRail todo={todo} keyPrefix={keyPrefix} onOpen={onOpen} />

      <div
        className="grid flex-1 items-center"
        style={{ gridTemplateColumns: trackColumns(ticks, scale) }}
      >
        <button
          type="button"
          onClick={onOpen}
          aria-label={label}
          title={label}
          style={{ gridColumn: `${place.index + 1} / span ${place.span}` }}
          className={cn(
            "focus-visible:ring-brand flex items-center outline-none focus-visible:ring-2",
            item.isPoint ? "justify-center" : "px-px",
          )}
        >
          {item.isPoint ? (
            // A diamond, not a one-column bar: the plan draws the distinction
            // between a task whose range is known and one that has a single
            // date, and the shapes have to differ or the distinction is lost.
            // A ring rather than a size change on hover — growing a marker
            // reads as motion in a dense grid without moving anything.
            <span
              className={cn(
                "size-2.5 rotate-45 rounded-[2px] ring-1 ring-white/15 transition-shadow duration-150 ring-inset group-hover:ring-white/35",
                tone,
              )}
            />
          ) : (
            // **Subtly rounded, not a pill.** A capsule reads as a chip; a 3px
            // radius reads as a span of time, which is what it is. The inset
            // ring keeps a solid fill from looking flat on a dark surface
            // without introducing a second colour or a shadow.
            <span
              className={cn(
                "h-4 w-full ring-1 ring-white/10 transition-opacity duration-150 ring-inset group-hover:opacity-90",
                tone,
                place.openStart ? "rounded-l-none" : "rounded-l-[3px]",
                place.openEnd ? "rounded-r-none" : "rounded-r-[3px]",
              )}
            />
          )}
        </button>
      </div>
    </Row>
  );
}

/**
 * The row shell, worn by a placed item and an undated one alike.
 *
 * **`relative` is load-bearing.** The axis — its column rules, its weekend tint
 * and the today line — is one absolutely positioned layer behind everything, so
 * a static row would be painted *under* it. Positioned and later in the DOM
 * puts the row on top, while its background stays transparent so the grid keeps
 * showing through; only the hover tint paints, and it is translucent.
 */
export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "border-hairline hover:bg-ink/[0.04] group relative flex border-b transition-colors duration-150 last:border-b-0",
        ROW_HEIGHT,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The item's name, pinned to the left edge of the scroller.
 *
 * Sticky rather than a second, synchronised scroll container: one scroller
 * means the header, the rows and the today line cannot drift apart mid-scroll.
 *
 * Shared with the undated section, which is a rail and an empty track — so an
 * item with no dates is listed in exactly the shape it would have if it had
 * them, which is the point of listing it at all.
 */
export function RowRail({
  todo,
  keyPrefix,
  onOpen,
}: {
  todo: Todo;
  keyPrefix: string;
  onOpen: () => void;
}) {
  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const priority = toPriority(todo.priority);
  const priorityMeta = priority ? PRIORITIES[priority] : null;
  const PriorityIcon = priorityMeta?.icon;

  const key = taskKey(keyPrefix, todo.board_key);

  return (
    <button
      type="button"
      onClick={onOpen}
      title={todo.title ?? undefined}
      className="border-hairline bg-surface group-hover:bg-elevated focus-visible:ring-brand sticky left-0 z-10 flex w-60 shrink-0 items-center gap-1.5 border-r px-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <TypeIcon className={cn("size-3.5 shrink-0", type.tone)} />

      {key && (
        <span className="text-ink-3/80 shrink-0 text-[10px] font-medium tabular-nums">
          {key}
        </span>
      )}

      <span className="text-ink min-w-0 flex-1 truncate text-[12.5px]">
        {todo.title || <span className="text-ink-3/60">Untitled</span>}
      </span>

      {PriorityIcon && (
        <PriorityIcon className={cn("size-3.5 shrink-0", priorityMeta?.tone)} />
      )}
    </button>
  );
}
