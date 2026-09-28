import { CheckIcon, ChevronDownIcon, EyeOffIcon } from "lucide-react";
import { FloatingPortal } from "@floating-ui/react";
import { useTranslation } from "react-i18next";

import { MENU_LABEL, POPOVER_PANEL } from "@/components/ui/controlChrome";
import { categoryOf } from "@/constants/columns";
import { useMoveTodo } from "@/services/todos/useMoveTodo";
import { useWorkflowGate } from "@/services/todos/useWorkflowGate";
import { selectableStatuses } from "@/services/workflow/statuses";
import { useStatuses } from "@/services/workflow/useWorkflow";
import { cn } from "@/utils/cn";
import { FIELD_CHIP, OPTION_ITEM } from "./fieldChrome";
import { useCardPopover } from "./useCardPopover";

// A card's status is its own row (todo.status_id); moving it to another status
// goes through useMoveTodo, same as the menu and a drag. Status names are user
// data and render as typed.
export default function StatusControl({
  todoId,
  statusId,
  variant = "chip",
}: {
  todoId: string;
  statusId: string | null;
  // "field" is the task detail's primary control, "lozenge" the List's cell; the chip stays the dense default for cards and menus
  variant?: "chip" | "field" | "lozenge";
}) {
  const { mounted, close, triggerProps, panelProps } = useCardPopover();
  const { data: statuses = [] } = useStatuses();
  const moveTo = useMoveTodo(todoId);
  const workflow = useWorkflowGate();
  const { t } = useTranslation();

  const current = statuses.find((status) => status.id === statusId) ?? null;
  const label = current ? current.name : t("status.none");
  // Hidden statuses are not offered, except the one the card is already in —
  // it stays valid for the cards in it.
  const options = selectableStatuses(statuses, statusId);

  return (
    <>
      <button
        type="button"
        {...triggerProps}
        title={t("status.labelled", { name: label })}
        aria-label={t("status.labelled", { name: label })}
        className={
          variant === "lozenge"
            ? cn(
                "text-ink focus-visible:ring-brand text-meta inline-flex h-5 max-w-full min-w-0 items-center gap-1 rounded border px-1.5 transition-colors outline-none focus-visible:ring-2",
                categoryOf(current?.category).lozenge,
              )
            : variant === "field"
              ? "border-hairline bg-surface text-ink hover:bg-wash-strong focus-visible:ring-brand rounded-control text-meta flex h-8 w-full min-w-0 items-center gap-2 border px-3 font-medium transition-colors outline-none focus-visible:ring-2"
              : cn(
                  FIELD_CHIP,
                  "bg-wash-strong text-ink-2 hover:bg-ink/15 hover:text-ink min-w-0 shrink gap-1.5",
                )
        }
      >
        {variant !== "lozenge" && (
          <span
            className={cn(
              "shrink-0 rounded-full",
              variant === "field" ? "size-2" : "size-1.5",
              categoryOf(current?.category).dot,
            )}
          />
        )}
        <span
          className={cn(
            "truncate",
            variant === "field" && "min-w-0 flex-1 text-left",
          )}
        >
          {label}
        </span>
        {variant === "field" && (
          <ChevronDownIcon className="text-ink-3 -mr-1 size-3.5 shrink-0" />
        )}
        {variant === "lozenge" && (
          <ChevronDownIcon className="size-3 shrink-0 opacity-70" />
        )}
      </button>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={t("status.label")}
            className={cn(POPOVER_PANEL, "z-50 max-h-64 w-48 overflow-y-auto")}
          >
            <p className={MENU_LABEL}>{t("status.label")}</p>

            {options.map((status) => {
              const selected = status.id === statusId;
              // Offered only if the workflow would accept it. The API refuses it
              // too — this is so the option is not there to click in the first place.
              const refusal = selected
                ? null
                : workflow.refusal(current?.category, status.category);

              return (
                <button
                  key={status.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  disabled={refusal !== null}
                  title={refusal ?? undefined}
                  onClick={() => {
                    if (!selected) moveTo(status);
                    close();
                  }}
                  className={OPTION_ITEM}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      categoryOf(status.category).dot,
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{status.name}</span>
                  {status.is_hidden && (
                    <EyeOffIcon
                      className="text-ink-3 size-3.5 shrink-0"
                      aria-label={t("status.hidden")}
                    />
                  )}
                  {selected && <CheckIcon className="text-brand size-4" />}
                </button>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
