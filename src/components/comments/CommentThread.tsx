import { useState } from "react";
import { MessageSquareIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  const boardId = useBoardId();

  const { data: comments, isPending, error } = useComments(todoId);
  const { data: members = [] } = useBoardMembers(boardId);
  const { canComment } = usePermissions();

  const count = comments?.length ?? 0;

  return (
    <section className={hideHeading ? undefined : "mt-8"}>
      {!hideHeading && (
        <h3 className="text-ink-3 text-mini mb-3 flex items-center gap-2 font-semibold tracking-[0.08em] uppercase">
          Comments
          {count > 0 && (
            <span className="text-ink-3/70 tabular-nums">{count}</span>
          )}
        </h3>
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
        <p className="text-status-red text-sm">
          Could not load this discussion.
        </p>
      ) : count === 0 ? (
        <div className="text-ink-3 flex items-center gap-2 py-1 text-sm">
          <MessageSquareIcon className="size-4 shrink-0" />
          <span>
            No comments yet.
            {canComment && " Start the discussion below."}
          </span>
        </div>
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

      {canComment && <Composer todoId={todoId} />}
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
            {author ? memberName(author) : "Former member"}
          </span>

          <time
            dateTime={comment.created_at}
            title={new Date(comment.created_at).toLocaleString()}
            className="text-ink-3 text-xs"
          >
            {relativeTime(comment.created_at)}
          </time>

          {isEdited(comment) && (
            <span
              title={`Edited ${relativeTime(comment.updated_at)}`}
              className="text-ink-3 text-xs"
            >
              (edited)
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
              aria-label="Edit comment"
              className="border-hairline text-ink focus:border-brand/60 focus:ring-brand/25 rounded-card w-full resize-y border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2"
            />

            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={
                  update.isPending ||
                  editedValue(draft ?? "", comment.content) === null
                }
                className="bg-brand rounded-control px-2.5 py-1 text-xs font-medium text-white disabled:opacity-45"
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>

              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-ink-3 hover:text-ink rounded-control px-1.5 py-1 text-xs font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-ink-2 mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {comment.content}
            </p>

            {(mayEdit || mayDelete) && (
              <div className="mt-1 flex items-center gap-3">
                {mayEdit && (
                  <button
                    type="button"
                    onClick={() => setDraft(comment.content)}
                    className="text-ink-3 hover:text-ink text-xs font-medium"
                  >
                    Edit
                  </button>
                )}

                {mayDelete &&
                  (confirmingDelete ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-ink-3">Delete this comment?</span>

                      <button
                        type="button"
                        onClick={() =>
                          remove.mutate({ id: comment.id, todoId })
                        }
                        disabled={remove.isPending}
                        className="text-status-red font-medium disabled:opacity-45"
                      >
                        {remove.isPending ? "Deleting…" : "Delete"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="text-ink-3 hover:text-ink font-medium"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="text-ink-3 hover:text-status-red text-xs font-medium"
                    >
                      Delete
                    </button>
                  ))}
              </div>
            )}
          </>
        )}

        {(update.isError || remove.isError) && !editing && (
          <p className="text-status-red mt-1 text-xs">
            {update.isError ? "That edit did not save." : null}
            {remove.isError ? "That comment was not deleted." : null}
          </p>
        )}
      </div>
    </article>
  );
}

function Composer({ todoId }: { todoId: string }) {
  const [draft, setDraft] = useState("");
  const add = useAddComment();

  const value = commentValue(draft);

  function post() {
    if (value === null) return;

    add.mutate({ todoId, content: value });

    // cleared right away, not in onSuccess — the write is optimistic so it's already in the thread below
    setDraft("");
  }

  return (
    <div className="mt-5">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            post();
          }
        }}
        rows={3}
        placeholder="Add a comment…"
        aria-label="Add a comment"
        className="border-hairline text-ink placeholder:text-ink-3 focus:border-brand/60 focus:ring-brand/25 rounded-card w-full resize-y border bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={post}
          disabled={value === null || add.isPending}
          className={cn(
            "bg-brand rounded-control px-3 py-1.5 text-xs font-medium text-white",
            "disabled:opacity-45",
          )}
        >
          {add.isPending ? "Posting…" : "Comment"}
        </button>

        <span className="text-ink-3 text-mini hidden sm:inline">
          ⌘↵ to post
        </span>
      </div>
    </div>
  );
}
