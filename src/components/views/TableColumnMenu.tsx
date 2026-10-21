import { useTranslation } from "react-i18next";
import { FloatingPortal } from "@floating-ui/react";
import { MoreHorizontalIcon, type LucideIcon } from "lucide-react";

import { useCardPopover } from "@/components/todo/TodoItem/useCardPopover";
import IconButton from "@/components/ui/IconButton";
import {
  MENU_ITEM,
  MENU_SEPARATOR,
  POPOVER_PANEL,
} from "@/components/ui/controlChrome";
import { cn } from "@/utils/cn";

export interface ColumnAction {
  label: string;
  icon: LucideIcon;
  run: () => void;
}

// One column's actions, behind the header's own button: the List and the
// Timeline both put theirs here, so a column behaves the same in either view.
export default function TableColumnMenu({
  name,
  groups,
}: {
  name: string;
  groups: ColumnAction[][];
}) {
  const { t } = useTranslation();
  const { open, mounted, close, triggerProps, panelProps } = useCardPopover();
  const label = t("list.columnActions", { name });

  return (
    <>
      <IconButton
        {...triggerProps}
        size="xs"
        tooltip={false}
        label={label}
        aria-haspopup="menu"
        data-no-drag
        className={cn(
          "coarse:opacity-100 opacity-0 group-hover/th:opacity-100 focus-visible:opacity-100",
          open && "opacity-100",
        )}
      >
        <MoreHorizontalIcon />
      </IconButton>

      {mounted && (
        <FloatingPortal>
          <div
            {...panelProps}
            role="menu"
            aria-label={label}
            className={cn(POPOVER_PANEL, "z-50 w-48")}
          >
            {groups
              .filter((group) => group.length > 0)
              .map((group, index) => (
                <div key={index} role="group">
                  {index > 0 && (
                    <div role="separator" className={MENU_SEPARATOR} />
                  )}

                  {group.map(({ label: item, icon: Icon, run }) => (
                    <button
                      key={item}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        close();
                        run();
                      }}
                      className={MENU_ITEM}
                    >
                      <Icon />
                      {item}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
