import { useTranslation } from "react-i18next";
import { useState } from "react";
import { MessageSquareIcon } from "lucide-react";

import SectionHeader, { EmptyLine } from "@/components/todo/SectionHeader";
import {
  INLINE_ACTION,
  INLINE_ACTION_DANGER,
  TEXT_FIELD,
} from "@/components/todo/detailChrome";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DIALOG_CONFIRM } from "@/components/ui/dialogChrome";
import { Skeleton } from "@/components/ui/skeleton";
import { memberInitial, memberName } from "@/components/members/memberLabels";
import { useAuth } from "@/services/auth/useAuth";
import {
  commentValue,
  editedValue,
  isEdited,
} from "@/services/comments/commentDraft";
import { useAddComment } from "@/services/comments/useAddComment";
import { useComments } from "@/services/comments/useComments";
import { useDeleteComment } from "@/services/comments/useDeleteComment";
import { useUpdateComment } from "@/services/comments/useUpdateComment";
import {
  canDeleteComment,
  canEditComment,
} from "@/services/members/permissions";
import type { BoardMember } from "@/services/members/membersApi";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { useBoardId } from "@/hooks/useBoardId";
import { usePermissions } from "@/hooks/usePermissions";
import type { Comment } from "@/types/data";
import { cn } from "@/utils/cn";
import { relativeTime } from "@/utils/relativeTime";

export default function CommentThread({
  todoId,
  hideHeading = false,
}: {
  todoId: string;
  // ActivitySection's Comments tab already says "Comments" above this, so it passes true to skip the redundant heading
  hideHeading?: boolean;
}) {
  const { t } = useTranslation();
  const boardId = useBoardId();

  const { data: comments, isPending, error } = useComments(todoId);
  const { data: members = [] } = useBoardMembers(boardId);
  const { canComment } = usePermissions();

  const count = comments?.length ?? 0;

  return (
    <section>
      {!hideHeading && (
        <SectionHeader
          title={t("taskActivity.comments")}
          count={count > 0 ? count : null}
        />
      )}

      {isPending ? (
        <div className="space-y-4" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-2.5">
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="text-status-red text-meta">{t("comments.loadFailed")}</p>
      ) : count === 0 ? (
        <EmptyLine icon={MessageSquareIcon}>
          <span>
            {t("comments.empty")}
            {canComment && ` ${t("comments.startBelow")}`}
          </span>
        </EmptyLine>
      ) : (
        <ol className="space-y-4">
          {comments!.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                author={members.find(
                  (member) => member.id === comment.author_id,
                )}
                todoId={todoId}
              />
            </li>
          ))}
        </ol>
      )}

      <Composer todoId={todoId} className="mt-5" />
    </section>
  );
}

// exported so ActivitySection's "All" tab can reuse it for the interleaved feed
export function CommentRow({
  comment,
  author,
  todoId,
}: {
  comment: Comment;
  author: BoardMember | undefined;
  todoId: string;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { role } = usePermissions();

  const update = useUpdateComment();
  const remove = useDeleteComment();

  const [draft, setDraft] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editing = draft !== null;

  const mayEdit = canEditComment(user?.id, comment.author_id);
  const mayDelete = canDeleteComment(role, user?.id, comment.author_id);

  function save() {
    const next = editedValue(draft ?? "", comment.content);

    // null covers unchanged and blanked-out alike — blanking reverts, since there's no such thing as an empty comment
    if (next === null) {
      setDraft(null);
      return;
    }

    update.mutate(
      { id: comment.id, content: next, todoId },
      { onSuccess: () => setDraft(null) },
    );
  }

  return (
    <article className="flex gap-2.5">
      <Avatar size="sm" className="mt-0.5 shrink-0">
        <AvatarImage src={author?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
          {author ? memberInitial(author) : "–"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-ink text-sm font-medium">
            {author ? memberName(author) : t("members.former")}
          </span>

          <time
            dateTime={comment.created_at}
            title={new Date(comment.created_at).toLocaleString(i18n.language)}
            className="text-ink-3 text-xs"
          >
            {relativeTime(comment.created_at)}
          </time>

          {isEdited(comment) && (
            <span
              title={t("comments.editedAgo", {
                when: relativeTime(comment.updated_at),
              })}
              className="text-ink-3 text-xs"
            >
              {t("comments.edited")}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1.5">
            <textarea
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(event) => {
                // stop Escape bubbling to the modal, or it closes the whole task
                if (event.key === "Escape") {
                  event.preventDefault();
                  setDraft(null);
                }

                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  save();
                }
              }}
              rows={3}
              autoFocus
              aria-label={t("comments.editLabel")}
              className={cn(
                TEXT_FIELD,
                "rounded-card w-full resize-y px-3 py-2 text-sm leading-relaxed",
              )}
            />

            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={save}
                disabled={
                  update.isPending ||
                  editedValue(draft ?? "", comment.content) === null
                }
                className={cn(DIALOG_CONFIRM, "h-7 px-2.5 text-xs")}
              >
                {update.isPending ? t("common.saving") : t("common.save")}
              </button>

              <button
                type="button"
                onClick={() => setDraft(null)}
                className={cn(INLINE_ACTION, "py-1 text-xs")}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-ink-2 mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {comment.content}
            </p>

            {(mayEdit || mayDelete) && (
              <div className="mt-0.5 -ml-1.5 flex items-center gap-1 text-xs">
                {mayEdit && (
                  <button
                    type="button"
                    onClick={() => setDraft(comment.content)}
                    className={INLINE_ACTION}
                  >
                    {t("common.edit")}
                  </button>
                )}

                {mayDelete &&
                  (confirmingDelete ? (
                    <span className="flex items-center gap-1">
                      <span className="text-ink-3 px-1.5">
                        {t("comments.deleteQuestion")}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          remove.mutate({ id: comment.id, todoId })
                        }
                        disabled={remove.isPending}
                        className={INLINE_ACTION_DANGER}
                      >
                        {remove.isPending
                          ? t("common.deleting")
                          : t("common.delete")}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className={INLINE_ACTION}
                      >
                        {t("common.keep")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className={cn(
                        INLINE_ACTION,
                        "hover:text-status-red hover:bg-status-red/10",
                      )}
                    >
                      {t("common.delete")}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}

        {(update.isError || remove.isError) && !editing && (
          <p className="text-status-red mt-1 text-xs">
            {update.isError ? t("comments.editFailed") : null}
            {remove.isError ? t("comments.deleteFailed") : null}
          </p>
        )}
      </div>
    </article>
  );
}

// gated here rather than at each call site, so no tab can render a composer for a role that can't comment
export function Composer({
  todoId,
  className,
}: {
  todoId: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const add = useAddComment();
  const { canComment } = usePermissions();

  const value = commentValue(draft);

  function post() {
    if (value === null) return;

    add.mutate({ todoId, content: value });

    // cleared right away, not in onSuccess — the write is optimistic so it's already in the thread below
    setDraft("");
  }

  if (!canComment) return null;

  return (
    <div className={className}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            post();
          }
        }}
        rows={2}
        placeholder={t("comments.addPlaceholder")}
        aria-label={t("comments.addLabel")}
        className={cn(
          TEXT_FIELD,
          "rounded-card field-sizing-content max-h-72 min-h-16 w-full resize-y px-3 py-2.5 text-sm leading-relaxed",
        )}
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={post}
          disabled={value === null || add.isPending}
          className={cn(DIALOG_CONFIRM, "h-8 px-3 text-xs")}
        >
          {add.isPending ? t("comments.posting") : t("comments.comment")}
        </button>

        <span className="text-ink-3 text-mini hidden sm:inline">
          {t("comments.shortcut")}
        </span>
      </div>
    </div>
  );
}
