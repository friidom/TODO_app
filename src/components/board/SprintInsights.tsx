import { useTranslation } from "react-i18next";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { RocketIcon } from "lucide-react";

import EmptyState from "@/components/ui/EmptyState";
import SectionHeader from "@/components/todo/SectionHeader";
import { SECTION_TITLE } from "@/components/todo/detailChrome";
import { workTypeOf } from "@/constants/workTypes";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useSprintsEnabled } from "@/hooks/useSprintsEnabled";
import { activeSprintOf } from "@/services/sprints/activeSprint";
import {
  daysLeft,
  roundPoints,
  sprintBurndown,
  sprintInsights,
  type SprintBurndown,
} from "@/services/sprints/insights";
import { useSprints } from "@/services/sprints/useSprints";
import { useTodos } from "@/services/todos/useTodos";
import { useStatuses } from "@/services/workflow/useWorkflow";
import type { IStatus, Sprint, Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { formatDue, todayISO } from "@/utils/dueDate";
import { taskKey } from "@/utils/taskKey";

const NO_TODOS: Todo[] = [];
const NO_STATUSES: IStatus[] = [];

const HINT = "text-ink-3 text-meta leading-relaxed";

// The body of the ?panel=insights drawer — everything is derived from the board's cached todos, nothing is fetched here.
export default function SprintInsights() {
  const { t } = useTranslation();
  const sprintsEnabled = useSprintsEnabled();
  const { data: sprints = [] } = useSprints();

  const sprint = sprintsEnabled ? activeSprintOf(sprints) : null;

  if (!sprint) {
    return (
      <EmptyState
        icon={RocketIcon}
        title={t("sprint.noneActive")}
        hint={t("sprint.noneActiveHint")}
      />
    );
  }

  return <Insights sprint={sprint} />;
}

function Insights({ sprint }: { sprint: Sprint }) {
  const { t } = useTranslation();
  const keyPrefix = useKeyPrefix();
  const { openTask } = useOpenTask();
  const { data: todos = NO_TODOS } = useTodos();
  const { data: statuses = NO_STATUSES } = useStatuses();

  const today = todayISO();

  const insights = useMemo(
    () => sprintInsights(todos, sprint.id, statuses, today),
    [todos, sprint.id, statuses, today],
  );

  const burndown = useMemo(
    () => sprintBurndown(todos, sprint, statuses, today),
    [todos, sprint, statuses, today],
  );

  const left = daysLeft(sprint.end_date, today);

  const dates =
    sprint.start_date || sprint.end_date
      ? `${sprint.start_date ? formatDue(sprint.start_date, today) : "?"} – ${
          sprint.end_date ? formatDue(sprint.end_date, today) : "?"
        }`
      : t("sprint.noDates");

  const { points } = insights;
  const progressed = insights.donePercent + insights.inProgressPercent;

  return (
    <div className="space-y-7 p-5">
      <header className="space-y-1.5">
        <p className="text-ink-2 text-meta leading-relaxed">
          {t("insights.intro")}
        </p>

        <p className="text-ink text-meta">
          <span className="font-semibold">{t("fields.sprint")}:</span>{" "}
          {sprint.name}
        </p>

        <p className="text-ink-3 text-mini flex flex-wrap items-center gap-x-2">
          <span className="tabular-nums">{dates}</span>

          {left !== null && (
            <span
              className={cn(
                "font-medium tabular-nums",
                left < 0 ? "text-status-red" : "text-ink-2",
              )}
            >
              {left < 0
                ? t("sprint.daysOverdue", { count: Math.abs(left) })
                : left === 0
                  ? t("sprint.endsToday")
                  : t("sprint.daysLeft", { count: left })}
            </span>
          )}
        </p>
      </header>

      <section className="border-hairline bg-surface rounded-card animate-in fade-in-0 slide-in-from-bottom-1 border p-4 duration-300">
        <h3 className={cn(SECTION_TITLE, "mb-1.5")}>
          {t("insights.attention")}
        </h3>

        {insights.overdue.length === 0 ? (
          <p className={HINT}>{t("insights.attentionEmpty")}</p>
        ) : (
          <ul className="-mx-2 mt-2">
            {insights.overdue.map((todo) => {
              const workType = workTypeOf(todo.type);
              const WorkTypeIcon = workType.icon;
              const key = taskKey(keyPrefix, todo.board_key);

              return (
                <li key={todo.id}>
                  <button
                    type="button"
                    onClick={() => openTask(todo.id)}
                    className="rounded-control text-meta hover:bg-wash-strong focus-visible:ring-brand flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2"
                  >
                    <WorkTypeIcon
                      className={cn("size-4 shrink-0", workType.tone)}
                    />

                    {key && (
                      <span className="text-ink-3 text-mini shrink-0 tabular-nums">
                        {key}
                      </span>
                    )}

                    <span className="text-ink min-w-0 flex-1 truncate">
                      {todo.title || t("common.untitled")}
                    </span>

                    {todo.due_date && (
                      <span className="text-status-red text-mini shrink-0 font-medium tabular-nums">
                        {formatDue(todo.due_date, today)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Block title={t("sprint.progress")}>
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-valuenow={insights.donePercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("sprint.progress")}
            className="bg-wash-strong h-3 min-w-0 flex-1 overflow-hidden rounded-full"
          >
            {/* one sliding group, so done and in progress enter together and never overlap mid-animation */}
            <div
              style={{ width: `${progressed}%` }}
              className="animate-in slide-in-from-left-full flex h-full transition-[width] duration-500 ease-out"
            >
              <div
                style={{
                  width: progressed
                    ? `${(insights.donePercent / progressed) * 100}%`
                    : 0,
                }}
                className="bg-status-green h-full transition-[width] duration-500"
              />
              <div className="bg-brand h-full flex-1" />
            </div>
          </div>

          <span className="text-ink text-meta shrink-0 font-semibold tabular-nums">
            {t("common.percentDone", { percent: insights.donePercent })}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            label={t("columnCategory.done")}
            value={`${insights.donePercent}%`}
          />

          <Stat
            label={t("columnCategory.in_progress")}
            value={`${insights.inProgressPercent}%`}
            tone="text-brand"
          />

          <Stat
            label={t("insights.notStarted")}
            value={`${insights.notStartedPercent}%`}
          />
        </dl>
      </Block>

      <Block title={t("sprint.points")}>
        <dl className="grid grid-cols-3 gap-3">
          <Stat
            label={t("sprint.points")}
            value={String(roundPoints(points.total))}
          />

          <Stat
            label={t("fields.completed")}
            value={String(roundPoints(points.completed))}
            tone="text-status-green"
          />

          <Stat
            label={t("sprint.unestimated")}
            value={String(points.unestimated)}
          />
        </dl>
      </Block>

      <Block title={t("insights.burndown")}>
        <Burndown burndown={burndown} today={today} />
      </Block>

      <Block title={t("insights.epics")}>
        {insights.epics.length === 0 ? (
          <p className={HINT}>{t("insights.noEpics")}</p>
        ) : (
          <>
            <p className={HINT}>
              {t("insights.epicsSummary", { count: insights.epics.length })}
            </p>

            <ul className="mt-3 space-y-3.5">
              {insights.epics.map(({ epic, progress }) => {
                const key = taskKey(keyPrefix, epic.board_key);

                return (
                  <li key={epic.id}>
                    <div className="text-meta flex items-baseline gap-2">
                      <button
                        type="button"
                        onClick={() => openTask(epic.id)}
                        className="text-brand focus-visible:ring-brand min-w-0 flex-1 truncate rounded text-left font-medium outline-none hover:underline focus-visible:ring-2"
                      >
                        {[key, epic.title].filter(Boolean).join(" ")}
                      </button>

                      <span className="text-ink-2 text-mini shrink-0 font-medium tabular-nums">
                        {t("common.percentDone", { percent: progress.percent })}
                      </span>
                    </div>

                    <div
                      role="progressbar"
                      aria-valuenow={progress.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={epic.title ?? undefined}
                      className="bg-wash-strong mt-1.5 h-2 overflow-hidden rounded-full"
                    >
                      <div
                        style={{ width: `${progress.percent}%` }}
                        className="bg-status-green animate-in slide-in-from-left-full h-full rounded-full transition-[width] duration-500 ease-out"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Block>
    </div>
  );
}

// Collapsible like Jira's, but not remembered: the drawer is a glance, and every section is open each time it opens.
function Block({ title, children }: { title: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
      <SectionHeader
        title={title}
        collapse={{
          collapsed,
          onToggle: () => setCollapsed((value) => !value),
          noun: title,
        }}
      />

      {!collapsed && (
        <div className="animate-in fade-in-0 duration-150">{children}</div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-3 text-mini truncate">{label}</dt>

      <dd className={cn("text-xl font-semibold tabular-nums", tone)}>
        {value}
      </dd>
    </div>
  );
}

const PLOT_HEIGHT = 50;
// Room above 100% so the full-scope line is not clipped by the top edge.
const HEADROOM = 2;
const GRID = [1, 0.75, 0.5, 0.25, 0];

// Hand-rolled SVG like TrendsChart: one small chart does not justify a charting dependency. HTML carries the text so
// it keeps the page font and stays upright inside the stretched viewBox.
function Burndown({
  burndown,
  today,
}: {
  burndown: SprintBurndown | null;
  today: string;
}) {
  const { t } = useTranslation();
  const plot = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  if (!burndown) return <p className={HINT}>{t("insights.noStartDate")}</p>;

  if (burndown.total === 0)
    return <p className={HINT}>{t("insights.noWork")}</p>;

  const { unit, total, done, days, remaining, endIndex, todayIndex } = burndown;
  const last = days.length - 1;

  const doneKey =
    unit === "points" ? "insights.pointsDone" : "insights.itemsDone";
  const leftKey =
    unit === "points" ? "insights.pointsLeft" : "insights.itemsLeft";

  const xOf = (index: number) => (last === 0 ? 50 : (index / last) * 100);
  const yOf = (value: number) =>
    HEADROOM + (1 - value / total) * (PLOT_HEIGHT - HEADROOM);

  // steps rather than slopes: work drops on the day it was finished, and stays put between
  const line = remaining
    .map((value, index) =>
      index === 0
        ? `M ${xOf(0)} ${yOf(value)}`
        : `H ${xOf(index).toFixed(3)} V ${yOf(value).toFixed(3)}`,
    )
    .join(" ");

  const area =
    remaining.length > 0
      ? `${line} H ${xOf(remaining.length - 1).toFixed(3)} V ${PLOT_HEIGHT} H ${xOf(0)} Z`
      : "";

  // start, sprint end and the last day, minus any that would crowd the one before it
  const ticks = [0, endIndex, last]
    .filter((index): index is number => index !== null)
    .filter(
      (index, position, all) =>
        all.indexOf(index) === position &&
        (position === 0 || xOf(index) - xOf(all[position - 1]) >= 18),
    );

  const markers = [endIndex, todayIndex].filter(
    (index, position, all): index is number =>
      index !== null && index > 0 && all.indexOf(index) === position,
  );

  const focus =
    hovered === null ? null : Math.min(hovered, remaining.length - 1);

  function hover(clientX: number) {
    const rect = plot.current?.getBoundingClientRect();

    if (!rect || remaining.length === 0) return;

    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);

    setHovered(Math.round(ratio * last));
  }

  return (
    <div className="animate-in fade-in-0 duration-300">
      <p className={cn(HINT, "mb-3")}>
        {t(doneKey, { count: done })}, {t(leftKey, { count: total - done })}
      </p>

      <div className="flex gap-2">
        <div className="text-ink-3 text-micro relative h-36 w-8 shrink-0 tabular-nums">
          {GRID.map((share) => (
            <span
              key={share}
              style={{ top: `${(yOf(total * share) / PLOT_HEIGHT) * 100}%` }}
              className="absolute right-0 -translate-y-1/2"
            >
              {Math.round(share * 100)}%
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            ref={plot}
            onPointerMove={(event) => hover(event.clientX)}
            onPointerLeave={() => setHovered(null)}
            className="relative h-36 touch-none"
          >
            <svg
              viewBox={`0 0 100 ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={`${t("insights.burndown")}: ${t(doneKey, { count: done })}, ${t(leftKey, { count: total - done })}`}
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <defs>
                {/* the tone class lives on the gradient itself — currentColor in a stop resolves against its own color */}
                <linearGradient
                  id="insights-burndown-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                  className="text-brand"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity="0.24"
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0.04"
                  />
                </linearGradient>
              </defs>

              {GRID.map((share) => (
                <line
                  key={share}
                  x1="0"
                  x2="100"
                  y1={yOf(total * share)}
                  y2={yOf(total * share)}
                  stroke="currentColor"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  className="text-ink/[0.07]"
                />
              ))}

              {markers.map((index) => (
                <line
                  key={index}
                  x1={xOf(index)}
                  x2={xOf(index)}
                  y1="0"
                  y2={PLOT_HEIGHT}
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                  className="text-ink-3/60"
                />
              ))}

              {endIndex !== null && endIndex > 0 && (
                <line
                  x1={xOf(0)}
                  y1={yOf(total)}
                  x2={xOf(endIndex)}
                  y2={yOf(0)}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="text-ink-3"
                />
              )}

              {area && <path d={area} fill="url(#insights-burndown-fill)" />}

              {line && (
                <path
                  d={line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="text-brand"
                />
              )}

              {focus !== null && (
                <line
                  x1={xOf(focus)}
                  x2={xOf(focus)}
                  y1="0"
                  y2={PLOT_HEIGHT}
                  stroke="currentColor"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  className="text-brand/50"
                />
              )}
            </svg>

            {focus !== null && (
              <>
                <span
                  aria-hidden
                  style={{
                    left: `${xOf(focus)}%`,
                    top: `${(yOf(remaining[focus]) / PLOT_HEIGHT) * 100}%`,
                  }}
                  className="bg-brand ring-elevated pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                />

                <span
                  aria-hidden
                  style={{ left: `${Math.min(Math.max(xOf(focus), 18), 82)}%` }}
                  className="bg-ink text-canvas text-mini shadow-e2 pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full rounded-md px-2 py-1 font-medium whitespace-nowrap tabular-nums"
                >
                  {formatDue(days[focus], today)} ·{" "}
                  {t(leftKey, { count: remaining[focus] })}
                </span>
              </>
            )}
          </div>

          <div className="text-ink-3 text-micro relative mt-1.5 h-4 tabular-nums">
            {ticks.map((index) => (
              <span
                key={index}
                style={{ left: `${xOf(index)}%` }}
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  index === 0
                    ? ""
                    : index === last
                      ? "-translate-x-full"
                      : "-translate-x-1/2",
                )}
              >
                {formatDue(days[index], today)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="text-ink-2 text-mini mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="bg-brand size-2 rounded-full" />
          {t("insights.remainingWork")}
        </span>

        {endIndex !== null && endIndex > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="bg-ink-3 size-2 rounded-full" />
            {t("insights.guideline")}
          </span>
        )}
      </div>

      <p className="text-ink-3 text-mini mt-2 leading-relaxed">
        {t("insights.currentScope")}
      </p>
    </div>
  );
}
