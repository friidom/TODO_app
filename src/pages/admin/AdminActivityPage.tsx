import { useSearchParams } from "react-router";

import AdminShell from "@/components/admin/AdminShell";
import {
  AdminCell,
  AdminEmpty,
  AdminGrid,
  AdminRow,
} from "@/components/admin/AdminTable";
import Loading from "@/components/loading/LoadingPage";
import { HEADER_CONTROL } from "@/components/board/headerControl";
import { useAdminPeriod } from "@/hooks/useAdminPeriod";
import {
  useAdminActivity,
  useAdminBoards,
  useAdminUsers,
} from "@/services/admin/useAdmin";
import { rangeLabel } from "@/services/admin/format";
import { relativeTime } from "@/utils/relativeTime";

const COLUMNS =
  "minmax(8rem,1fr) minmax(7rem,0.8fr) minmax(12rem,2fr) minmax(9rem,1fr) 7rem";

export default function AdminActivityPage() {
  const { period } = useAdminPeriod();
  const [params, setParams] = useSearchParams();

  const user = params.get("user") ?? undefined;
  const board = params.get("board") ?? undefined;
  const action = params.get("action") ?? undefined;

  const { data, isLoading, error } = useAdminActivity({
    period,
    user,
    board,
    action,
  });
  const { data: users } = useAdminUsers(period);
  const { data: boards } = useAdminBoards(period);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);

    if (value === "") next.delete(key);
    else next.set(key, value);

    setParams(next, { replace: true });
  };

  const rows = data?.activities ?? [];

  const actions = [...new Set(rows.map((row) => row.action))].sort();

  return (
    <AdminShell
      title="Activity"
      hint={
        data
          ? `${rows.length} entries · ${rangeLabel(data.from, data.to)}`
          : "Across every board"
      }
      actions={
        <div className="flex flex-wrap gap-1.5">
          <select
            aria-label="Filter by developer"
            className={HEADER_CONTROL}
            value={user ?? ""}
            onChange={(event) => setFilter("user", event.target.value)}
          >
            <option value="">Everyone</option>
            {(users?.users ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.username}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by board"
            className={HEADER_CONTROL}
            value={board ?? ""}
            onChange={(event) => setFilter("board", event.target.value)}
          >
            <option value="">Every board</option>
            {(boards?.boards ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.title ?? "Untitled board"}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by action"
            className={HEADER_CONTROL}
            value={action ?? ""}
            onChange={(event) => setFilter("action", event.target.value)}
          >
            <option value="">Every action</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {isLoading ? (
        <Loading />
      ) : error ? (
        <AdminEmpty>That did not load. Try again.</AdminEmpty>
      ) : (
        <AdminGrid columns={COLUMNS} label="System-wide activity">
          <AdminRow header>
            <AdminCell header>Developer</AdminCell>
            <AdminCell header>Action</AdminCell>
            <AdminCell header>Item</AdminCell>
            <AdminCell header>Board</AdminCell>
            <AdminCell header align="right">
              When
            </AdminCell>
          </AdminRow>

          {rows.length === 0 ? (
            <AdminEmpty>Nothing happened in this window.</AdminEmpty>
          ) : (
            rows.map((row) => (
              <AdminRow key={row.id}>
                <AdminCell>
                  <span className="text-ink">
                    {row.actor_username ?? "Unknown"}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-2 text-micro uppercase">
                    {row.action}
                  </span>
                </AdminCell>

                <AdminCell>
                  {row.board_key !== null && (
                    <span className="text-ink-3 text-micro mr-1.5 tabular-nums">
                      KAN-{row.board_key}
                    </span>
                  )}
                  <span className="text-ink-2">
                    {row.title ?? row.entity_type}
                  </span>
                </AdminCell>

                <AdminCell>
                  <span className="text-ink-3">{row.board_title ?? "—"}</span>
                </AdminCell>

                <AdminCell align="right">
                  <span
                    className="text-ink-3 text-micro"
                    title={row.created_at}
                  >
                    {relativeTime(row.created_at)}
                  </span>
                </AdminCell>
              </AdminRow>
            ))
          )}
        </AdminGrid>
      )}
    </AdminShell>
  );
}
