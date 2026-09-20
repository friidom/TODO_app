import { useMemo, useState } from "react";
import { Link } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
} from "@/components/admin/AdminTable";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import { useAdminUsers } from "@/services/admin/useAdmin";
import { barWidth, dash, percent, rangeLabel } from "@/services/admin/format";
import {
  DEFAULT_USER_SORT,
  USER_SORT_LABELS,
  sortUsers,
  type UserSortKey,
} from "@/services/admin/sortUsers";
import { cn } from "@/utils/cn";
import type { AdminUser } from "@/services/admin/types";

const COLUMNS =
  "minmax(10rem,1.6fr) 5.5rem repeat(5, minmax(5.5rem,1fr)) minmax(10rem,1.3fr)";

const NUMERIC = [
  "completed_todos",
  "completed_points",
  "comments",
  "activities",
  "boards",
] as const;

export default function AdminUsersPage() {
  const { period } = useAdminPeriod();
  const { data, isFetching, error } = useAdminUsers(period);
  const [sort, setSort] = useState<UserSortKey>(DEFAULT_USER_SORT);

  const rows = useMemo(() => sortUsers(data?.users ?? [], sort), [data, sort]);

  const maxima = useMemo(() => {
    const result: Record<string, number> = {};

    for (const key of NUMERIC) {
      result[key] = rows.reduce(
        (highest, row) => Math.max(highest, row[key]),
        0,
      );
    }

    return result;
  }, [rows]);

  return (
    <AdminShell
      title="Developers"
      hint={
        data
          ? `${rows.length} people · ${rangeLabel(data.from, data.to)}`
          : "Factual metrics, side by side"
      }
      busy={isFetching}
    >
      {error ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <AdminGrid columns={COLUMNS} label="Developers and their metrics">
          <AdminRow header>
            <AdminCell header>
              <SortButton
                active={sort === "username"}
                onClick={() => setSort("username")}
              >
                {USER_SORT_LABELS.username}
              </SortButton>
            </AdminCell>

            <AdminCell header>Level</AdminCell>

            {NUMERIC.map((key) => (
              <AdminCell key={key} header align="right">
                <SortButton active={sort === key} onClick={() => setSort(key)}>
                  {USER_SORT_LABELS[key]}
                </SortButton>
              </AdminCell>
            ))}

            <AdminCell header align="right">
              <SortButton
                active={sort === "performance"}
                onClick={() => setSort("performance")}
              >
                {USER_SORT_LABELS.performance}
              </SortButton>
            </AdminCell>
          </AdminRow>

          {rows.length === 0 ? (
            <AdminEmpty>No developers yet.</AdminEmpty>
          ) : (
            rows.map((row) => (
              <UserRow key={row.id} row={row} maxima={maxima} period={period} />
            ))
          )}
        </AdminGrid>
      )}
    </AdminShell>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      // uppercase repeated here rather than inherited: Tailwind's preflight
      // gives <button> `font: inherit` but not text-transform, so a sortable
      // header rendered "Developer" beside a static "LEVEL".
      className={cn(
        "hover:text-ink uppercase transition-colors",
        active && "text-brand",
      )}
    >
      {children}
    </button>
  );
}

function UserRow({
  row,
  maxima,
  period,
}: {
  row: AdminUser;
  maxima: Record<string, number>;
  period: string;
}) {
  return (
    <AdminRow>
      <AdminCell>
        <Link
          to={`/admin/users/${row.id}?period=${period}`}
          className="text-ink hover:text-brand font-medium transition-colors"
        >
          {row.username}
        </Link>
      </AdminCell>

      <AdminCell>
        <span className="text-ink-3 text-micro uppercase">
          {row.seniority ?? "—"}
        </span>
      </AdminCell>

      {NUMERIC.map((key) => (
        <AdminCell key={key} align="right">
          <MetricCell value={row[key]} max={maxima[key] ?? 0} />
        </AdminCell>
      ))}

      <AdminCell align="right">
        <span
          className={cn(
            "font-medium",
            row.performance === null ? "text-ink-3" : "text-ink",
          )}
        >
          {percent(row.performance)}
        </span>
        <span
          className="text-ink-3 text-micro ml-1.5"
          title="completed points / target points"
        >
          {dash(row.completed_points)} / {dash(row.target_points)}
        </span>
      </AdminCell>
    </AdminRow>
  );
}

function MetricCell({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="bg-ink/[0.06] hidden h-1 w-12 overflow-hidden rounded-full lg:block">
        <span
          className="bg-brand/70 block h-full rounded-full"
          style={{ width: barWidth(value, max) }}
        />
      </span>
      <span className="text-ink-2 w-8 text-right tabular-nums">{value}</span>
    </span>
  );
}
