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

/**
 * One work item's discussion, inside the task detail modal (M7-03).
 *
 * **It lives under the description rather than in the details rail.** The left
 * column of the modal is what someone wrote and the right is what the system
 * knows; a comment is unambiguously the former. It is also the one section that
 * grows without bound, which is why it goes below a description of fixed height
 * and inside the column that already scrolls.
 *
 * **Nothing is fetched until a task is open.** `useComments` is enabled on the
 * work item id, which is M7's stated risk answered in the place it was raised:
 * *"do not join comments into the board fetch; load them per open work item."*
 *
 * **People come from the roster the board already has.** Same as `ActivityFeed`:
 * `board_roster` is in cache before this mounts, so a thread costs one query and
 * renders each author's *current* name and face rather than a snapshot of them.
 * An author the roster does not know — someone removed from the board since
 * they wrote — still renders, as an anonymous disc. Their words did not stop
 * existing when their membership did.
 *
 * **Permission gating here is UX and never enforcement.** Every rule is already
 * a policy in M7-01, so a control this hides is a call that would have been
 * refused anyway. What it buys is honesty: an edit button that always fails
 * reads as a broken product rather than as somebody else's comment.
 */
export default function CommentThread({ todoId }: { todoId: string }) {
  const boardId = useBoardId();

  const { data: comments, isPending, error } = useComments(todoId);
  const { data: members = [] } = useBoardMembers(boardId);
  const { canComment } = usePermissions();

  const count = comments?.length ?? 0;

  return (
    <section className="mt-8">
      <h3 className="text-ink-3 text-mini mb-3 flex items-center gap-2 font-semibold tracking-[0.08em] uppercase">
        Comments
        {/* The count only once there is one. A "0" beside the heading is a
            label for an absence the empty state below already explains. */}
        {count > 0 && (
          <span className="text-ink-3/70 tabular-nums">{count}</span>
        )}
      </h3>

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
        // Deliberately not a toast: the failure belongs to this section, and a
        // toast would leave an empty thread reading as "no comments yet".
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

      {/* Hidden rather than disabled for a non-member. A composer nobody may
          use is a control that raises the question of why it is there — and
          `canComment` is false only while the roster loads or for someone with
          no role at all, neither of whom should be invited to type. */}
      {canComment && <Composer todoId={todoId} />}
    </section>
  );
}

/**
 * One comment: who, when, what, and — only for the people entitled to them —
 * the two controls that change it.
 */
function CommentRow({
  comment,
  author,
  todoId,
}: {
  comment: Comment;
  /** Undefined for an author the roster no longer holds. */
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

    // Null covers unchanged and blanked alike. Blanking reverts, because a
    // comment with no text has no representation — deleting is the other
    // control, and it asks first.
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
          {/* A dash rather than an invented initial for someone the roster has
              not caught up with — the same choice `PresenceStack` makes. */}
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
            // The absolute time as a tooltip, because a column of relative
            // stamps says how long ago and never when.
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
                // Escape marks itself handled so the modal's own listener does
                // not take the whole task with it — the rule every nested
                // dismissible here follows.
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
            {/* `whitespace-pre-wrap` and `break-words` together are what the
                plan's "long content wraps" asks for: the first keeps the
                paragraph breaks somebody typed, the second stops an unbroken
                URL widening the modal. */}
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
                    // Inline rather than a modal. A dialog over a dialog for
                    // one sentence of text is more ceremony than the thing
                    // being removed, and the row is still on screen to see.
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

        {/* The mutations' own failures, in the row they belong to. The
            QueryClient's MutationCache toasts them as well; this is what says
            *which* comment did not save once the toast is gone. */}
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

/** The composer. Posts on ⌘/Ctrl+Enter as well as on the button. */
function Composer({ todoId }: { todoId: string }) {
  const [draft, setDraft] = useState("");
  const add = useAddComment();

  const value = commentValue(draft);

  function post() {
    // Null is empty or whitespace-only. The button is disabled for both, so
    // this is the keyboard path — and the database refuses them regardless.
    if (value === null) return;

    add.mutate({ todoId, content: value });

    // Cleared immediately rather than in `onSuccess`. The write is optimistic,
    // so the comment is already in the thread below; leaving the text in the
    // box would show it twice and invite a second post of it. A failure rolls
    // the thread back and toasts, which is the same contract every other
    // optimistic surface here has.
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
          // Disabled on empty and whitespace-only, which is `commentValue`'s
          // whole job — the constraint in M7-01 refuses both, and a disabled
          // button is a better answer than a check-constraint violation.
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
