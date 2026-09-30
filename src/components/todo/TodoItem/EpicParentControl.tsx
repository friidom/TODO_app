import { useTranslation } from "react-i18next";
import { CheckIcon, LinkIcon, Link2OffIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";

import { useEpics } from "@/services/todos/useSubtasks";
import { useKeyPrefix } from "@/hooks/useKeyPrefix";
import { taskKey } from "@/utils/taskKey";
import {
  MENU_ITEM,
  MENU_LABEL,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { cn } from "@/utils/cn";
import {
  FIELD_CELL,
  FIELD_CHIP,
  FIELD_EMPTY,
  OPTION_ITEM,
} from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

// list is exactly the board's Epics — anything else would be refused by enforce_work_item_hierarchy anyway
export default function EpicParentControl({
  value: epicId,
  onChange,
  variant,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  variant?: "cell";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { epics } = useEpics();
  const { t } = useTranslation();
  const keyPrefix = useKeyPrefix();

  const epic = epics.find((candidate) => candidate.id === epicId) ?? null;
  const key = epic ? taskKey(keyPrefix, epic.board_key) : null;

  const label = epic
    ? t("epicParent.parent", {
        name: key ?? epic.title ?? t("activity.anEpic"),
      })
    : t("epicParent.none");

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={label}
        aria-label={label}
        className={
          variant === "cell"
            ? cn(FIELD_CELL, !epic && "text-ink-3")
            : cn(
                FIELD_CHIP,
                "min-w-0 shrink",
                epic
                  ? "bg-status-orange/15 text-status-orange hover:bg-status-orange/25"
                  : FIELD_EMPTY,
              )
        }
      >
        {variant === "cell" ? (
          epic ? (
            <>
              {key && <span className="text-ink-3 shrink-0">{key}</span>}
              <span className="min-w-0 truncate">
                {epic.title || t("common.untitled")}
              </span>
            </>
          ) : (
            t("common.none")
          )
        ) : (
          <>
            <LinkIcon className="size-3 shrink-0" />
            <span className="min-w-0 truncate">
              {epic
                ? (key ?? epic.title ?? t("common.untitled"))
                : t("common.none")}
            </span>
          </>
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("epicParent.label")}
            className={cn(POPOVER_PANEL, "z-50 max-h-64 w-56 overflow-y-auto")}
          >
            <p className={MENU_LABEL}>{t("workType.epic")}</p>

            {epics.length === 0 ? (
              <p className="text-ink-3 text-meta px-2 py-2">
                {t("epicParent.noEpics")}
              </p>
            ) : (
              <ul>
                {epics.map((candidate) => {
                  const selected = candidate.id === epicId;
                  const candidateKey = taskKey(keyPrefix, candidate.board_key);

                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(selected ? null : candidate.id);
                          close();
                        }}
                        className={cn(OPTION_ITEM, "min-w-0")}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {candidateKey && (
                            <span className="text-ink-3 tabular-nums">
                              {candidateKey}{" "}
                            </span>
                          )}
                          {candidate.title || t("common.untitled")}
                        </span>

                        {selected && (
                          <CheckIcon className="text-brand size-4" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {epicId !== null && (
              <>
                <div className={MENU_SEPARATOR} />

                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    close();
                  }}
                  className={MENU_ITEM}
                >
                  <Link2OffIcon />
                  {t("epicParent.remove")}
                </button>
              </>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
