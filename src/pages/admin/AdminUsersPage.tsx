import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { Link } from "react-router";

import AdminPage from "@/components/admin/AdminPage";
import RoleChip from "@/components/admin/RoleChip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
  AdminSkeleton,
  AdminSortButton as SortButton,
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
  const { t } = useTranslation();
  const { period } = useAdminPeriod();
  const { data, error } = useAdminUsers(period);
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
    <AdminPage
      title={t("admin.sections.users")}
      description={
        data
          ? t("admin.users.hint", {
              count: rows.length,
              range: rangeLabel(data.from, data.to),
            })
          : t("admin.users.hintLoading")
      }
    >
      {error ? (
        <AdminEmpty>{t("admin.loadFailedRetry")}</AdminEmpty>
      ) : !data ? (
        <AdminSkeleton />
      ) : (
        <AdminGrid columns={COLUMNS} label={t("admin.users.gridLabel")}>
          <AdminRow header>
            <AdminCell header>
              <SortButton
                active={sort === "username"}
                onClick={() => setSort("username")}
                direction="asc"
              >
                {USER_SORT_LABELS.username}
              </SortButton>
            </AdminCell>

            <AdminCell header>{t("admin.level")}</AdminCell>

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
            <AdminEmpty>{t("admin.noDevelopers")}</AdminEmpty>
          ) : (
            rows.map((row) => (
              <UserRow key={row.id} row={row} maxima={maxima} period={period} />
            ))
          )}
        </AdminGrid>
      )}
    </AdminPage>
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
  const { t } = useTranslation();

  return (
    <AdminRow>
      <AdminCell>
        <Link
          to={`/admin/users/${row.id}?period=${period}`}
          title={`${row.username} · ${row.email}`}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <Avatar size="sm" className="shrink-0">
            <AvatarImage src={row.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
              {row.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="text-ink group-hover:text-brand truncate font-medium transition-colors">
                {row.username}
              </span>
              {row.org_role === "superadmin" && <RoleChip />}
            </span>
            <span className="text-ink-3 text-mini block truncate">
              {row.email}
            </span>
          </span>
        </Link>
      </AdminCell>

      <AdminCell>
        {row.seniority ? (
          <span className="border-hairline text-ink-2 text-mini rounded border px-1.5 py-px">
            {t(`admin.seniority.${row.seniority}`)}
          </span>
        ) : (
          <span className="text-ink-3">—</span>
        )}
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
          title={t("admin.pointsOverTarget")}
        >
          {dash(row.completed_points)} / {dash(row.target_points)}
        </span>
      </AdminCell>
    </AdminRow>
  );
}

// A zero gets neither a bar nor ink: in a quiet period most cells are zero,
// and a column of empty tracks hid the few rows that did something.
function MetricCell({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="hidden h-1 w-12 overflow-hidden rounded-full lg:block">
        {value > 0 && (
          <span
            className="bg-brand/70 block h-full rounded-full"
            style={{ width: barWidth(value, max) }}
          />
        )}
      </span>
      <span
        className={cn(
          "w-8 text-right tabular-nums",
          value > 0 ? "text-ink" : "text-ink-3/70",
        )}
      >
        {value}
      </span>
    </span>
  );
}
