import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import AgingBuckets from "@/components/admin/AgingBuckets";
import CumulativeFlow from "@/components/admin/CumulativeFlow";
import DualSeries from "@/components/admin/DualSeries";
import FlowStats from "@/components/admin/FlowStats";
import Histogram from "@/components/admin/Histogram";
import ScopeFilter from "@/components/admin/ScopeFilter";
import WipStrip from "@/components/admin/WipStrip";
import {
  HEADER_CONTROL,
  HEADER_CONTROL_ACTIVE,
} from "@/components/board/headerControl";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminScope } from "@/hooks/useAdminScope";
import { startedNote } from "@/services/admin/backfill";
import { formatDuration, rangeLabel } from "@/services/admin/format";
import { periodLabel } from "@/services/admin/periods";
import {
  useAdminBoards,
  useAdminFlow,
  useAdminSpaces,
} from "@/services/admin/useAdmin";
import {
  FLOW_SLICE_LABELS,
  FLOW_SLICES,
  type FlowSliceBy,
} from "@/services/admin/types";
import { cn } from "@/utils/cn";

const COLUMNS = "minmax(8rem,1.4fr) 6rem repeat(2, minmax(6rem,1fr))";

export default function AdminFlowPage() {
  const { period } = useAdminPeriod();
  const { scope, setScope } = useAdminScope();
  const slice = useSlice();

  const boards = useAdminBoards(period, scope.space);
  const spaces = useAdminSpaces(period);
  const { data, error, isFetching } = useAdminFlow({
    period,
    space: scope.space,
    board: scope.board,
    slice: slice.value,
  });

  const boardOptions = useMemo(
    () =>
      (boards.data?.boards ?? []).map((board) => ({
        id: board.id,
        label: board.title ?? "Untitled board",
      })),
    [boards.data],
  );

  const spaceOptions = useMemo(
    () =>
      (spaces.data?.spaces ?? [])
        .filter((space) => space.id !== null)
        .map((space) => ({ id: space.id!, label: space.title })),
    [spaces.data],
  );

  const note = data === undefined ? undefined : startedNote(data.from);
  const scopeQuery = scope.board ? `&board=${scope.board}` : "";

  return (
    <AdminShell
      title="Flow"
      hint={
        data === undefined
          ? "How work moves, and how long it takes"
          : `${periodLabel(period)} · ${rangeLabel(data.from, data.to)}`
      }
      busy={isFetching}
      actions={
        <ScopeFilter
          scope={scope}
          setScope={setScope}
          spaces={spaceOptions}
          boards={boardOptions}
        />
      }
    >
      {error ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : data === undefined ? (
        <AdminSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <CumulativeFlow
            points={data.cfd}
            bucket={data.bucket}
            windowTo={data.to}
            scopeQuery={scopeQuery}
            note={note}
          />

          <DualSeries points={data.series} bucket={data.bucket} />

          <div className="grid gap-3 lg:grid-cols-3">
            <FlowStats
              cycle={data.cycle_time}
              lead={data.lead_time}
              note={note}
            />

            <Histogram
              title="Cycle time distribution"
              hint="Where the tail is — a median alone cannot show it"
              bins={data.cycle_histogram}
              stats={data.cycle_time}
              className="lg:col-span-2"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <WipStrip
              slices={data.wip}
              scopeHint={
                scope.board === undefined
                  ? "Every open card across the system, by category"
                  : "Every open card on this board, by column"
              }
            />

            <AgingBuckets buckets={data.wip_aging} />
          </div>

          <SliceTable
            slices={data.slices}
            sliceBy={data.slice_by}
            onSlice={slice.set}
          />
        </div>
      )}
    </AdminShell>
  );
}

function useSlice(): { value: FlowSliceBy; set: (next: FlowSliceBy) => void } {
  const [params, setParams] = useSearchParams();
  const raw = params.get("slice");

  const value = (FLOW_SLICES as string[]).includes(raw ?? "")
    ? (raw as FlowSliceBy)
    : "estimate";

  const set = useCallback(
    (next: FlowSliceBy) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);

          if (next === "estimate") updated.delete("slice");
          else updated.set("slice", next);

          return updated;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { value, set };
}

function SliceTable({
  slices,
  sliceBy,
  onSlice,
}: {
  slices: {
    key: string | null;
    label: string;
    count: number;
    cycle_median_days: number | null;
    lead_median_days: number | null;
  }[];
  sliceBy: FlowSliceBy;
  onSlice: (next: FlowSliceBy) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-ink text-xs font-semibold tracking-tight">
            Duration by attribute
          </h2>
          <p className="text-ink-3 text-mini mt-0.5">
            Whether a bigger card really takes longer
          </p>
        </div>

        <div role="group" aria-label="Slice" className="flex flex-wrap gap-1">
          {FLOW_SLICES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onSlice(option)}
              aria-pressed={option === sliceBy}
              className={cn(
                HEADER_CONTROL,
                "px-2",
                option === sliceBy && HEADER_CONTROL_ACTIVE,
              )}
            >
              {FLOW_SLICE_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <AdminGrid columns={COLUMNS} label="Duration by attribute">
        <AdminRow header>
          <AdminCell header>
            {FLOW_SLICE_LABELS[sliceBy].replace("By ", "")}
          </AdminCell>
          <AdminCell header align="right">
            Finished
          </AdminCell>
          <AdminCell header align="right">
            Median cycle
          </AdminCell>
          <AdminCell header align="right">
            Median lead
          </AdminCell>
        </AdminRow>

        {slices.length === 0 ? (
          <AdminEmpty>Nothing finished in this window.</AdminEmpty>
        ) : (
          slices.map((row) => (
            <AdminRow key={row.key ?? "unset"}>
              <AdminCell>
                <span
                  className={cn("truncate", row.key === null && "text-ink-3")}
                >
                  {row.label}
                </span>
              </AdminCell>
              <AdminCell align="right">{row.count}</AdminCell>
              <AdminCell align="right">
                {formatDuration(row.cycle_median_days)}
              </AdminCell>
              <AdminCell align="right">
                {formatDuration(row.lead_median_days)}
              </AdminCell>
            </AdminRow>
          ))
        )}
      </AdminGrid>
    </section>
  );
}
