import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { COLUMN_WIDTH } from "@/components/columns/columnChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { useBoardId } from "@/hooks/useBoardId";
import { isViewMode, type ViewMode } from "@/services/views/registry";
import { defaultViewOf } from "@/services/views/tabs";
import { useDefaultViews } from "@/stores/defaultView";
import { cn } from "@/utils/cn";

import { useSkeletonFade } from "./skeletonFade";

export function SkeletonRegion({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const fade = useSkeletonFade<HTMLDivElement>();

  return (
    <div
      role="status"
      aria-label={t("common.loading")}
      ref={fade}
      className={cn("skeleton-in", className)}
    >
      {children}
    </div>
  );
}

const textWidth = (seed: number, min = 45, spread = 40) =>
  `${min + ((seed * 37) % spread)}%`;

const BOARD_CARDS = [3, 2, 4, 1];

function BoardSkeleton() {
  return (
    <SkeletonRegion className="flex h-full gap-3 overflow-hidden pb-4">
      {BOARD_CARDS.map((count, column) => (
        <div
          key={column}
          className={cn(
            COLUMN_WIDTH,
            "rounded-surface border-hairline bg-surface flex h-fit shrink-0 flex-col border",
          )}
        >
          <div className="flex h-12 items-center gap-2 px-4.5">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>

          <div className="flex flex-col gap-2.5 px-2 pb-2.5">
            {Array.from({ length: count }, (_, card) => (
              <div
                key={card}
                className="rounded-card border-hairline bg-elevated flex flex-col gap-2 border p-2.5"
              >
                <Skeleton className="h-2.5 w-14 rounded-full" />
                <Skeleton
                  className="h-3 rounded-full"
                  style={{ width: textWidth(column * 3 + card, 55) }}
                />
                <div className="mt-1 flex items-center justify-between">
                  <Skeleton className="rounded-control h-5 w-10" />
                  <Skeleton className="size-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function RowsSkeleton({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <SkeletonRegion className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="border-hairline flex h-10 items-center gap-3 border-b px-2"
        >
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-2.5 w-12 shrink-0 rounded-full" />
          <Skeleton
            className="h-3 rounded-full"
            style={{ width: textWidth(row, 25, 30) }}
          />
          <Skeleton className="ml-auto h-5 w-16 shrink-0 rounded-full" />
          <Skeleton className="size-6 shrink-0 rounded-full" />
        </div>
      ))}
    </SkeletonRegion>
  );
}

function SummarySkeleton() {
  return (
    <SkeletonRegion className="flex flex-col gap-3 pb-4">
      <div className="border-hairline bg-hairline rounded-card grid grid-cols-2 gap-px overflow-hidden border sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, tile) => (
          <div key={tile} className="bg-surface flex flex-col gap-2 p-4">
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="h-6 w-10 rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <div
            key={card}
            className="rounded-card border-hairline bg-surface flex h-64 flex-col gap-3 border p-4"
          >
            <Skeleton className="h-3 w-32 rounded-full" />
            <Skeleton className="mt-auto h-40 w-full rounded-md" />
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

function CalendarSkeleton() {
  return (
    <SkeletonRegion className="flex h-full flex-col gap-3 pb-4">
      <div className="flex h-9 items-center gap-2">
        <Skeleton className="h-7 w-36 rounded-md" />
        <Skeleton className="ml-auto h-7 w-24 rounded-md" />
      </div>

      <div className="border-hairline bg-hairline rounded-card grid min-h-0 flex-1 grid-cols-7 gap-px overflow-hidden border">
        {Array.from({ length: 35 }, (_, day) => (
          <div key={day} className="bg-surface flex flex-col gap-1.5 p-2">
            <Skeleton className="h-2.5 w-4 rounded-full" />
            {day % 4 === 1 && <Skeleton className="h-4 w-full rounded" />}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

function TimelineSkeleton() {
  return (
    <SkeletonRegion className="flex flex-col gap-1 pb-4">
      {Array.from({ length: 8 }, (_, row) => (
        <div key={row} className="flex h-10 items-center gap-3">
          <div className="flex w-(--timeline-rail) shrink-0 items-center gap-2 px-2">
            <Skeleton className="size-4 shrink-0 rounded" />
            <Skeleton
              className="h-3 rounded-full"
              style={{ width: textWidth(row, 40, 40) }}
            />
          </div>
          <Skeleton
            className="h-6 rounded-md"
            style={{
              marginLeft: `${(row * 9) % 30}%`,
              width: `${18 + ((row * 13) % 22)}%`,
            }}
          />
        </div>
      ))}
    </SkeletonRegion>
  );
}

export default function ViewSkeleton({ mode }: { mode: ViewMode }) {
  if (mode === "board") return <BoardSkeleton />;
  if (mode === "summary") return <SummarySkeleton />;
  if (mode === "calendar") return <CalendarSkeleton />;
  if (mode === "timeline") return <TimelineSkeleton />;

  return <RowsSkeleton />;
}

// Not useBoardView: this is a route fallback, so it ships in the entry chunk,
// and that hook would bring the whole filter and sort module with it.
export function BoardPageSkeleton() {
  const [params] = useSearchParams();
  const boardId = useBoardId();
  const fallback = useDefaultViews((store) =>
    defaultViewOf(store.views, boardId),
  );

  const raw = params.get("view");
  const mode = isViewMode(raw) ? raw : fallback;
  const fade = useSkeletonFade<HTMLDivElement>();

  const toolbar = (
    <div className="flex shrink-0 items-center gap-2">
      <Skeleton className="rounded-control h-9 w-56" />
      <Skeleton className="rounded-control h-9 w-20" />
      <Skeleton className="rounded-control h-9 w-20" />
    </div>
  );

  // Mirrors ViewShell, framed panel included for the List, so nothing moves
  // when the real page replaces it.
  return (
    <div
      ref={fade}
      className="skeleton-in flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="flex h-14 shrink-0 items-center gap-3 px-5 md:px-6">
        <Skeleton className="h-3 w-20 rounded-full" />
        <Skeleton className="h-5 w-44 rounded-md" />
      </div>

      <div className="border-hairline flex h-10 shrink-0 items-center gap-4 border-b px-5 md:px-6">
        {[16, 12, 14, 18].map((width, tab) => (
          <Skeleton
            key={tab}
            className="h-2.5 rounded-full"
            style={{ width: `${width * 4}px` }}
          />
        ))}
      </div>

      {mode === "list" ? (
        <div className="bg-elevated dark:bg-surface mx-5 my-4 flex min-h-0 min-w-0 flex-1 flex-col rounded-xl px-5 pt-4 pb-5 md:mx-6">
          <div className="pb-4">{toolbar}</div>
          <div className="min-h-0 min-w-0 flex-1">
            <ViewSkeleton mode={mode} />
          </div>
        </div>
      ) : (
        <>
          <div className="px-5 pt-4 pb-1 md:px-6">{toolbar}</div>
          <div className="min-h-0 min-w-0 flex-1 px-5 pt-3 md:px-6">
            <ViewSkeleton mode={mode} />
          </div>
        </>
      )}
    </div>
  );
}
