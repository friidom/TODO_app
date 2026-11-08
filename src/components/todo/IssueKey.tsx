import { useMemo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useBoardId } from "@/hooks/useBoardId";
import { useOpenTask } from "@/hooks/useOpenTask";
import { useBoards } from "@/services/boards/useBoards";
import { cn } from "@/utils/cn";
import { issueHref, splitTaskRefs, type IssueTarget } from "@/utils/taskRef";

const LINK =
  "text-brand decoration-brand/45 hover:decoration-brand focus-visible:ring-brand rounded-[3px] font-medium whitespace-nowrap tabular-nums underline underline-offset-[3px] transition-colors outline-none focus-visible:ring-2";

const plainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

// Presentational, so a row hands in its own onOpen rather than every key in a
// long list holding a router subscription. A null key is a card still being
// created: the trigger assigns the number, and the row waits for it here.
export default function IssueKey({
  issueKey,
  href,
  onOpen,
  done = false,
  className,
}: {
  issueKey: string | null;
  href: string;
  onOpen: () => void;
  done?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [wasPending] = useState(issueKey === null);

  if (issueKey === null) {
    return (
      <span
        role="status"
        aria-label={t("common.creating")}
        className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      >
        <span
          aria-hidden
          className="border-brand/25 border-t-brand size-3 shrink-0 animate-spin rounded-full border-[1.5px]"
        />
        <span aria-hidden className="skeleton h-2 w-7 rounded-full" />
      </span>
    );
  }

  return (
    <a
      href={href}
      title={t("list.open", { key: issueKey })}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        // the key sits inside rows and cards that have click handlers of their own
        event.stopPropagation();

        if (!plainClick(event)) return;

        event.preventDefault();
        onOpen();
      }}
      className={cn(
        LINK,
        done && "decoration-brand/70 line-through",
        wasPending &&
          "motion-safe:animate-in motion-safe:fade-in-0 duration-300",
        className,
      )}
    >
      {issueKey}
    </a>
  );
}

// Opens in place when the key belongs to the board on screen, so the view, its
// filters and Back all survive; anywhere else it navigates.
export function IssueRefLink({
  issueKey,
  to,
  className,
}: {
  issueKey: string;
  to?: IssueTarget | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const boardId = useBoardId();
  const { openTask } = useOpenTask();
  const href = issueHref(issueKey, to);

  return (
    <IssueKey
      issueKey={issueKey}
      href={href}
      className={className}
      onOpen={() => {
        if (to && to.boardId === boardId) openTask(to.todoId);
        else void navigate(href);
      }}
    />
  );
}

// Plain text in, text and links out — never HTML. Only keys of boards this
// person can open become links; the server still checks on the way in.
export function IssueRefText({
  text,
  resolve,
  linkClassName,
}: {
  text: string;
  resolve?: (key: string) => IssueTarget | null;
  linkClassName?: string;
}) {
  const { data: boards } = useBoards();

  const prefixes = useMemo(
    () =>
      boards ? new Set(boards.map((board) => board.key_prefix)) : undefined,
    [boards],
  );

  const segments = useMemo(
    () => splitTaskRefs(text, prefixes),
    [text, prefixes],
  );

  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          segment.text
        ) : (
          <IssueRefLink
            key={index}
            issueKey={segment.text}
            to={resolve?.(segment.text)}
            className={linkClassName}
          />
        ),
      )}
    </>
  );
}
