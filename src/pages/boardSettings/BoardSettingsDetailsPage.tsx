import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Loader2, TriangleAlertIcon } from "lucide-react";

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
import {
  BOARD_KEY_MAX_LENGTH,
  BOARD_KEY_MIN_LENGTH,
  boardKeyField,
  type BoardKeyError,
} from "@/utils/boardKey";
import { cn } from "@/utils/cn";

const TITLE_MAX = 120;

const KEY_ERROR: Record<BoardKeyError, string> = {
  required: "boardSettings.keyError.required",
  shape: "boardSettings.keyError.shape",
  tooShort: "boardSettings.keyError.tooShort",
  tooLong: "boardSettings.keyError.tooLong",
};

const KEY_ERROR_COUNT: Partial<Record<BoardKeyError, number>> = {
  tooShort: BOARD_KEY_MIN_LENGTH,
  tooLong: BOARD_KEY_MAX_LENGTH,
};

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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: spaces = [] } = useSpaces();
  const updateBoard = useUpdateBoard();

  const [title, setTitle] = useState(board.title ?? "");
  const [key, setKey] = useState(board.key_prefix);
  const [description, setDescription] = useState(board.description ?? "");
  const [space, setSpace] = useState(board.space_id ?? "");

  // Filing is owner-only in the database (boards_space_ownership refuses it for
  // anyone else), so for an admin the control would always fail.
  const canFile = board.owner_id === user?.id;

  const trimmed = title.trim();
  const tooLong = trimmed.length > TITLE_MAX;
  const keyField = boardKeyField(key, board);
  const invalid = !trimmed || tooLong || keyField.error !== undefined;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (invalid) return;

    const patch = {
      id: board.id,
      title: trimmed,
      ...(keyField.changed && { key_prefix: keyField.key }),
      // empty clears the column instead of storing "" — one value for "none"
      description: description.trim() || null,
      ...(canFile && { space_id: space || null }),
    };

    updateBoard.mutate(patch);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Section title={t("boardSettings.details")}>
        <Field label={t("common.name")}>
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
            {t("spaces.tooLong", { count: TITLE_MAX })}
          </p>
        )}

        <Field
          label={t("boardSettings.key")}
          hint={t("boardSettings.keyHint", {
            example: keyField.error ? board.key_prefix : keyField.key,
          })}
        >
          <input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            maxLength={BOARD_KEY_MAX_LENGTH + 5}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={keyField.error !== undefined}
            className={cn(
              FIELD_INPUT,
              "font-mono uppercase",
              keyField.error && FIELD_INPUT_INVALID,
            )}
          />
        </Field>

        {keyField.error && (
          <p className="text-status-red -mt-2 text-xs">
            {t(KEY_ERROR[keyField.error], {
              count: KEY_ERROR_COUNT[keyField.error],
            })}
          </p>
        )}

        {keyField.warn && (
          <div className="border-status-orange/40 bg-status-orange/10 text-ink-2 rounded-control -mt-1 flex gap-2 border px-3 py-2 text-xs leading-relaxed">
            <TriangleAlertIcon className="text-status-orange mt-px size-3.5 shrink-0" />

            <p className="min-w-0 flex-1">{t("boardSettings.keyWarning")}</p>
          </div>
        )}

        <Field label={t("task.description")}>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            className={cn(FIELD_INPUT, "resize-none")}
          />
        </Field>

        {canFile && (
          <Field label={t("boards.space")} hint={t("spaces.hint")}>
            <select
              value={space}
              onChange={(event) => setSpace(event.target.value)}
              className={FIELD_INPUT}
            >
              <option value="">{t("boards.noSpace")}</option>
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
            <p className="text-ink-3 mr-auto text-xs">{t("common.saved")}</p>
          )}

          <button
            type="submit"
            disabled={invalid || updateBoard.isPending}
            className="bg-brand text-brand-fg rounded-control inline-flex h-9 items-center gap-2 px-3.5 text-[13px] font-medium transition-opacity disabled:opacity-60"
          >
            {updateBoard.isPending && (
              <Loader2 className="size-3.5 animate-spin" />
            )}
            {updateBoard.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </Section>
    </form>
  );
}
