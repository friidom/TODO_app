import { useState } from "react";
import { Loader2 } from "lucide-react";

import BoardSettingsShell, {
  Field,
  Section,
} from "@/components/boardSettings/BoardSettingsShell";
import { FIELD_INPUT, FIELD_INPUT_INVALID } from "@/components/ui/fieldInput";
import { useBoardId } from "@/hooks/useBoardId";
import { useAuth } from "@/services/auth/useAuth";
import { useBoard } from "@/services/boards/useBoard";
import { useUpdateBoard } from "@/services/boards/useUpdateBoard";
import { useSpaces } from "@/services/spaces/useSpaces";
import type { IBoard } from "@/types/data";
import { cn } from "@/utils/cn";

const TITLE_MAX = 120;

export default function BoardSettingsDetailsPage() {
  const boardId = useBoardId();
  const { data: board } = useBoard(boardId);

  return (
    <BoardSettingsShell>
      {board ? <DetailsForm board={board} /> : null}
    </BoardSettingsShell>
  );
}

// Keyed off the loaded board so the form seeds once, without an effect — the
// idiom ProfilePage uses, for the reason it records there.
function DetailsForm({ board }: { board: IBoard }) {
  const { user } = useAuth();
  const { data: spaces = [] } = useSpaces();
  const updateBoard = useUpdateBoard();

  const [title, setTitle] = useState(board.title ?? "");
  const [description, setDescription] = useState(board.description ?? "");
  const [space, setSpace] = useState(board.space_id ?? "");

  // Filing is owner-only in the database (boards_space_ownership refuses it for
  // anyone else), so for an admin the control would always fail.
  const canFile = board.owner_id === user?.id;

  const trimmed = title.trim();
  const tooLong = trimmed.length > TITLE_MAX;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!trimmed || tooLong) return;

    const patch = {
      id: board.id,
      title: trimmed,
      // empty clears the column instead of storing "" — one value for "none"
      description: description.trim() || null,
      ...(canFile && { space_id: space || null }),
    };

    updateBoard.mutate(patch);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Section title="Details">
        <Field label="Name">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={TITLE_MAX + 20}
            aria-invalid={tooLong}
            className={cn(FIELD_INPUT, tooLong && FIELD_INPUT_INVALID)}
          />
        </Field>

        {tooLong && (
          <p className="text-status-red -mt-2 text-xs">
            Keep it to {TITLE_MAX} characters or fewer.
          </p>
        )}

        {/* Read-only: key_prefix is absent from updateBoardSchema on purpose,
            and card keys are never reused, so a rename would orphan every key
            already written into activity history. */}
        <Field
          label="Board key"
          hint="Used to label every card on this board. It can't be changed once cards exist."
        >
          <input
            value={board.key_prefix}
            readOnly
            disabled
            className={cn(FIELD_INPUT, "cursor-not-allowed opacity-60")}
          />
        </Field>

        <Field label="Description">
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            className={cn(FIELD_INPUT, "resize-none")}
          />
        </Field>

        {canFile && (
          <Field
            label="Space"
            hint="A space is a folder for your boards. It does not change who can see them."
          >
            <select
              value={space}
              onChange={(event) => setSpace(event.target.value)}
              className={FIELD_INPUT}
            >
              <option value="">No space</option>
              {spaces.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          {updateBoard.error && (
            <p className="text-status-red mr-auto text-xs">
              {updateBoard.error.message}
            </p>
          )}

          {updateBoard.isSuccess && !updateBoard.isPending && (
            <p className="text-ink-3 mr-auto text-xs">Saved.</p>
          )}

          <button
            type="submit"
            disabled={!trimmed || tooLong || updateBoard.isPending}
            className="bg-brand text-brand-fg rounded-control inline-flex h-9 items-center gap-2 px-3.5 text-[13px] font-medium transition-opacity disabled:opacity-60"
          >
            {updateBoard.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {updateBoard.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </Section>
    </form>
  );
}
