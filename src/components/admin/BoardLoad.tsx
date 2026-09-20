import SummaryCard, { DistributionRow, WidgetEmpty } from "@/components/summary/SummaryCard";
import type { AdminBoard } from "@/services/admin/types";

const TOP = 10;

export default function BoardLoad({
  boards,
  className,
}: {
  boards: AdminBoard[];
  className?: string;
}) {
  const ranked = [...boards]
    .sort((a, b) => b.completed_todos - a.completed_todos)
    .slice(0, TOP);

  const total = boards.reduce((sum, board) => sum + board.completed_todos, 0);
  const peak = ranked.reduce((highest, board) => Math.max(highest, board.completed_todos), 0);

  return (
    <SummaryCard
      title="Which boards carry the work"
      hint={`Completed tasks · top ${Math.min(TOP, ranked.length)} of ${boards.length}`}
      className={className}
    >
      {ranked.length === 0 ? (
        <WidgetEmpty>No boards yet.</WidgetEmpty>
      ) : (
        <div className="flex flex-col gap-2 px-3.5 pt-1 pb-3.5">
          {ranked.map((board) => (
            <DistributionRow
              key={board.id}
              label={board.title ?? "Untitled board"}
              count={board.completed_todos}
              percent={peak === 0 ? 0 : (board.completed_todos / peak) * 100}
              share={total === 0 ? 0 : (board.completed_todos / total) * 100}
              barClassName="bg-brand"
            />
          ))}
        </div>
      )}
    </SummaryCard>
  );
}
