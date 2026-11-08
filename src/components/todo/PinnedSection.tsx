import { useTranslation } from "react-i18next";
import { ArrowDownRightIcon } from "lucide-react";
import { IssueRefText } from "./IssueKey";
import { useIssueResolver } from "@/hooks/useIssueResolver";

import { memberInitial, memberName } from "@/components/members/memberLabels";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { reveal, type RevealTarget } from "@/hooks/useReveal";
import { fileKind, formatBytes } from "@/services/attachments/fileMeta";
import { useAttachments } from "@/services/attachments/useAttachments";
import { useComments } from "@/services/comments/useComments";
import { useBoardMembers } from "@/services/members/useBoardMembers";
import { pinnedItems } from "@/services/pins/pinned";
import { relativeTime } from "@/utils/relativeTime";
import DetailCard from "./DetailCard";
import { KIND_ICONS } from "./attachmentIcons";

// Hidden entirely while nothing is pinned: an empty "Pinned" heading would be
// a control with nothing behind it.
export default function PinnedSection({
  todoId,
  boardId,
}: {
  todoId: string;
  boardId: string;
}) {
  const { t } = useTranslation();
  const { data: comments = [] } = useComments(todoId);
  const { data: attachments = [] } = useAttachments(todoId);
  const { data: members = [] } = useBoardMembers(boardId);
  const resolve = useIssueResolver();

  const pinnedComments = pinnedItems(comments);
  const pinnedFiles = pinnedItems(attachments);
  const count = pinnedComments.length + pinnedFiles.length;

  if (count === 0) return null;

  return (
    <DetailCard id="pinned-items" title={t("pins.title")} count={count}>
      <ul className="divide-hairline divide-y">
        {pinnedComments.map((comment) => {
          const author = members.find(
            (member) => member.id === comment.author_id,
          );

          return (
            <li key={comment.id} className="flex gap-2.5 px-3.5 py-2.5">
              <Avatar size="sm" className="mt-0.5 shrink-0">
                <AvatarImage src={author?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-elevated text-ink-2 text-micro font-semibold">
                  {author ? memberInitial(author) : "–"}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="text-mini flex items-baseline gap-2">
                  <span className="text-ink font-medium">
                    {author ? memberName(author) : t("members.former")}
                  </span>
                  <span className="text-ink-3">
                    {relativeTime(comment.created_at)}
                  </span>
                </p>
                <p className="text-ink-2 text-meta line-clamp-2 break-words whitespace-pre-wrap">
                  <IssueRefText text={comment.content} resolve={resolve} />
                </p>
              </div>

              <GoTo target={{ kind: "comment", id: comment.id }} />
            </li>
          );
        })}

        {pinnedFiles.map((file) => {
          const Icon = KIND_ICONS[fileKind(file.mime_type, file.filename)];

          return (
            <li key={file.id} className="flex items-center gap-2.5 px-3.5 py-2">
              <span className="bg-ink/[0.06] text-ink-2 rounded-control grid size-7 shrink-0 place-items-center">
                <Icon className="size-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-ink text-meta truncate font-medium">
                  {file.filename}
                </p>
                <p className="text-ink-3 text-mini tabular-nums">
                  {formatBytes(file.size_bytes)}
                </p>
              </div>

              <GoTo target={{ kind: "attachment", id: file.id }} />
            </li>
          );
        })}
      </ul>
    </DetailCard>
  );
}

function GoTo({ target }: { target: RevealTarget }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => reveal(target)}
      className="text-ink-3 hover:text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control text-mini inline-flex h-7 shrink-0 items-center gap-1 self-center px-2 font-medium transition-colors duration-150 outline-none focus-visible:ring-2"
    >
      <ArrowDownRightIcon className="size-3.5" />
      {t("pins.goTo")}
    </button>
  );
}
