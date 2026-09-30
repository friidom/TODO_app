import { useTranslation } from "react-i18next";
import { useState } from "react";
import { X } from "lucide-react";

import { useUpdateColumn } from "@/services/columns/useUpdateColumn";
import type { IColumn } from "@/types/data";
import {
  DIALOG_ACTIONS,
  DIALOG_BODY,
  DIALOG_CANCEL,
  DIALOG_CONFIRM,
  DIALOG_ERROR,
  DIALOG_LABEL,
  DIALOG_TITLE,
} from "@/components/ui/dialogChrome";
import { FIELD_INPUT } from "@/components/ui/fieldInput";
import IconButton from "@/components/ui/IconButton";

interface Props {
  column: IColumn | null;
  onClose: () => void;
}

/** Empty input means "no limit" — that is the difference between "" and 0. */
function parseLimit(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : NaN;
}

export default function ColumnLimitModal({ column, onClose }: Props) {
  if (!column) return null;

  return <ColumnLimitDialog column={column} onClose={onClose} />;
}

function ColumnLimitDialog({
  column,
  onClose,
}: {
  column: IColumn;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [min, setMin] = useState(column.min_limit?.toString() ?? "");
  const [max, setMax] = useState(column.max_limit?.toString() ?? "");

  const updateColumn = useUpdateColumn();

  const minValue = parseLimit(min);
  const maxValue = parseLimit(max);

  const error = Number.isNaN(minValue)
    ? t("column.limitMinInvalid")
    : Number.isNaN(maxValue)
      ? t("column.limitMaxInvalid")
      : minValue !== null && maxValue !== null && minValue > maxValue
        ? t("column.limitMinOverMax")
        : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (error) return;

    updateColumn.mutate(
      { id: column.id, min_limit: minValue, max_limit: maxValue },
      { onSuccess: onClose },
    );
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="border-hairline bg-surface rounded-surface shadow-e3 max-h-full w-[480px] max-w-full overflow-y-auto border p-5 sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className={DIALOG_TITLE}>{t("column.limitTitle")}</h2>

          <IconButton
            label={t("common.close")}
            size="md"
            tooltip={false}
            onClick={onClose}
            className="-mt-1"
          >
            <X />
          </IconButton>
        </div>

        <p className={`${DIALOG_BODY} mb-6`}>{t("column.limitBody")}</p>

        <div className="mb-2 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="column-min-limit" className={DIALOG_LABEL}>
              {t("column.minimum")}
            </label>

            <input
              id="column-min-limit"
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              placeholder={t("column.noLimit")}
              className={FIELD_INPUT}
            />
          </div>

          <div>
            <label htmlFor="column-max-limit" className={DIALOG_LABEL}>
              {t("column.maximum")}
            </label>

            <input
              id="column-max-limit"
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder={t("column.noLimit")}
              className={FIELD_INPUT}
            />
          </div>
        </div>

        {(error || updateColumn.error) && (
          <p className={DIALOG_ERROR}>{error ?? updateColumn.error?.message}</p>
        )}

        <div className={DIALOG_ACTIONS}>
          <button type="button" onClick={onClose} className={DIALOG_CANCEL}>
            {t("common.cancel")}
          </button>

          <button
            type="submit"
            disabled={!!error || updateColumn.isPending}
            className={DIALOG_CONFIRM}
          >
            {updateColumn.isPending ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
