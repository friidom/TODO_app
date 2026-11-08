import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import DialogHeader from "@/components/ui/DialogHeader";
import Modal from "@/components/ui/Modal";
import {
  DIALOG_ACTIONS,
  DIALOG_CANCEL,
  DIALOG_DANGER,
  DIALOG_LABEL,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { planDelete } from "@/services/todos/bulk";
import { useTodos } from "@/services/todos/useTodos";
import type { Todo } from "@/types/data";
import { cn } from "@/utils/cn";
import { taskKey } from "@/utils/taskKey";

const NO_TODOS: Todo[] = [];

export default function DeleteWorkItemsDialog({
  items,
  onClose,
  onConfirm,
}: {
  items: Todo[];
  onClose: () => void;
  onConfirm: (plan: ReturnType<typeof planDelete>) => void;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const keyPrefix = useKeyPrefix();
  const { data: all = NO_TODOS } = useTodos();
  const [typed, setTyped] = useState("");

  const plan = useMemo(() => planDelete(items, all), [items, all]);

  const word = t("bulk.deleteWord");
  const guarded = plan.removed.size > 1;
  const ready = !guarded || typed.trim().toLowerCase() === word.toLowerCase();

  const only = items.length === 1 ? items[0] : null;
  const title = only
    ? t("bulk.deleteOneTitle", {
        name:
          taskKey(keyPrefix, only.board_key) ??
          (only.title || t("common.untitled")),
      })
    : t("bulk.deleteTitle", { count: items.length });

  // split around a marker so the word can be bold in any language's word order
  const [before, after] = t("bulk.typeToConfirm", { word: "\u0000" }).split(
    "\u0000",
  );

  return (
    <Modal title={title} onClose={onClose} width="w-[460px]">
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (ready) onConfirm(plan);
        }}
      >
        <DialogHeader
          danger
          title={title}
          description={t("bulk.deleteBody", { count: items.length })}
          onClose={onClose}
        />

        {plan.cascaded > 0 && (
          <p className="border-status-red/30 bg-status-red/10 text-status-red rounded-control text-meta border px-3 py-2 font-medium">
            {t("bulk.deleteCascade", { count: plan.cascaded })}
          </p>
        )}

        {guarded && (
          <div className="mt-4">
            <label htmlFor={inputId} className={DIALOG_LABEL}>
              {before}
              <strong className="text-ink font-semibold">{word}</strong>
              {after}
            </label>

            <input
              id={inputId}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className={cn(
                FIELD_INPUT,
                "focus:border-status-red/60 focus:ring-status-red/25",
              )}
            />
          </div>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button type="submit" disabled={!ready} className={DIALOG_DANGER}>
            {items.length > 1
              ? t("bulk.deleteCount", { count: items.length })
              : t("common.delete")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
