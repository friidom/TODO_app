import { dash } from "@/services/admin/format";
import type { SystemTotals } from "@/services/admin/types";

export default function StatTiles({ totals }: { totals: SystemTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile label="Completed tasks" value={totals.completed_todos} />

      <Tile
        label="Completed points"
        value={totals.completed_points}
        // D-7: a points figure never travels without the count of work
        // nobody sized, or it reads as the whole of what was finished.
        aside={
          totals.unestimated_completed > 0
            ? `${totals.unestimated_completed} unestimated`
            : undefined
        }
      />

      <Tile label="Tasks created" value={totals.created_todos} />
      <Tile label="Comments" value={totals.comments} />
      <Tile label="Activity events" value={totals.activities} />
      <Tile label="Open tasks" value={totals.open_todos} quiet />
      <Tile label="Developers" value={totals.users} quiet />
      <Tile label="Boards" value={totals.boards} quiet />
    </div>
  );
}

function Tile({
  label,
  value,
  aside,
  quiet = false,
}: {
  label: string;
  value: number;
  aside?: string;
  quiet?: boolean;
}) {
  return (
    <div className="border-hairline bg-surface rounded-card flex min-w-0 flex-col gap-0.5 border px-3.5 py-3">
      <span className="text-ink-3 text-micro truncate font-semibold tracking-wide uppercase">
        {label}
      </span>

      <span
        className={`truncate text-2xl font-semibold tabular-nums ${quiet ? "text-ink-2" : "text-ink"}`}
      >
        {dash(value)}
      </span>

      <span className="text-ink-3 text-mini h-4 truncate">{aside ?? ""}</span>
    </div>
  );
}
