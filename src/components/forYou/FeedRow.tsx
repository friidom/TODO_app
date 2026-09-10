import { workTypeOf } from "@/constants/workTypes";
import type { FeedItem } from "@/services/forYou/feed";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

// avatar only renders when isMine — profiles RLS is self-only, so a cross-board feed can't resolve other assignees without a per-board RPC
export default function FeedRow({
  item,
  now,
  isMine,
  avatarUrl,
  initial,
  onOpen,
}: {
  item: FeedItem;
  now: number;
  isMine: boolean;
  avatarUrl?: string | null;
  initial: string;
  onOpen: () => void;
}) {
  const { todo } = item;

  const type = workTypeOf(todo.type);
  const TypeIcon = type.icon;

  const meta = [todo.type, item.key, item.boardName].filter(Boolean);

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="hover:bg-ink/[0.04] focus-visible:ring-brand flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 outline-none focus-visible:ring-2 sm:px-3"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            type.chip,
          )}
        >
          <TypeIcon className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-meta font-medium">
            {todo.title || <span className="text-ink-3/70">Untitled</span>}
          </span>

          <span className="text-ink-3 mt-0.5 block truncate text-mini">
            {meta.join(" · ")}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2.5">
          {isMine &&
            (avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="hidden size-6 rounded-full object-cover sm:block"
              />
            ) : (
              <span className="bg-brand-soft text-brand hidden size-6 place-items-center rounded-full text-micro font-semibold sm:grid">
                {initial}
              </span>
            ))}

          <span className="text-ink-3 text-mini tabular-nums">
            {relativeTime(item.at, now)}
          </span>
        </span>
      </button>

    </li>
  );
}
