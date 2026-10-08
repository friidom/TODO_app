import { useTranslation } from "react-i18next";
import { ArrowUpDownIcon, Rows3Icon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardView } from "@/hooks/useBoardView";
import { GROUP_LABELS, SORT_LABELS } from "@/services/todos/view";
import { capabilitiesOf } from "@/services/views/registry";
import { GroupOptions } from "./BoardGroup";
import { SortOptions } from "./BoardSort";
import ToolbarButton from "./ToolbarButton";

// Group and Sort folded into one trigger for a narrow toolbar — same view.setGroup/setSort/setDir, nothing held here
export default function ViewOptions({
  view,
  className,
}: {
  view: BoardView;
  className?: string;
}) {
  const { t } = useTranslation();
  const { canGroup, canSort } = capabilitiesOf(view.mode);

  const grouped = canGroup && view.group !== "none";
  const sorted = canSort && view.sort !== "manual";

  const state = [
    grouped && t("view.groupedBy", { name: GROUP_LABELS[view.group] }),
    sorted && t("view.sortedBy", { name: SORT_LABELS[view.sort] }),
  ].filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            label={
              state.length
                ? t("view.optionsState", { state: state.join(", ") })
                : t("view.options")
            }
            text={t("view.options")}
            collapse="hidden @5xl:inline"
            // not the sliders: those are View settings, which sit in the same row
            icon={<Rows3Icon className="size-4" />}
            active={grouped || sorted}
            className={className}
          />
        }
      />

      <DropdownMenuContent align="start" className="w-56">
        {canGroup && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Rows3Icon />
              <span className="flex-1">{t("toolbar.group")}</span>
              <span className="text-ink-3">{GROUP_LABELS[view.group]}</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent className="w-44">
              <GroupOptions view={view} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {canSort && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDownIcon />
              <span className="flex-1">{t("toolbar.sort")}</span>
              <span className="text-ink-3">{SORT_LABELS[view.sort]}</span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent className="w-48">
              <SortOptions view={view} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
